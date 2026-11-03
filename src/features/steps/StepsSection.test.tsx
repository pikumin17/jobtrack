import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectionStep } from '@/lib/database.types'
import { StepsSection } from './StepsSection'

const { calls } = vi.hoisted(() => ({ calls: [] as { op: string; table?: string; args: unknown }[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (rows: unknown) => {
        calls.push({ op: 'insert', table, args: rows })
        return { error: null }
      },
      update: (values: unknown) => ({
        eq: (_: string, id: string) => ({
          select: async () => {
            calls.push({ op: 'update', table, args: { id, values } })
            return { data: [{ id }], error: null }
          },
        }),
      }),
      delete: () => ({
        eq: (_: string, id: string) => ({
          select: async () => {
            calls.push({ op: 'delete', table, args: id })
            return { data: [{ id }], error: null }
          },
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      calls.push({ op: 'rpc', args: { name, ...(args as object) } })
      return { error: null }
    },
  },
}))

function step(id: string, label: string, status: SelectionStep['status'], position: number): SelectionStep {
  return {
    id,
    user_id: 'u1',
    company_id: 'c1',
    position,
    kind: 'interview',
    label,
    status,
    deadline_date: null,
    deadline_at: null,
    scheduled_at: null,
    scheduled_end_at: null,
    completed_at: null,
    result_expected_on: null,
    result_at: null,
    place: null,
    memo: null,
    created_at: '2026-10-12T00:00:00Z',
    updated_at: '2026-10-12T00:00:00Z',
  }
}

function renderSection(steps: SelectionStep[], readOnly = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <StepsSection companyId="c1" steps={steps} isError={false} readOnly={readOnly} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
})

describe('選考ステップ', () => {
  it('よくある流れを1回の追加でまとめて登録する（N-6）', async () => {
    const user = userEvent.setup()
    renderSection([])
    await user.click(screen.getByRole('button', { name: 'ステップを追加' }))
    await user.click(screen.getByRole('button', { name: 'まとめて追加' }))
    expect(calls).toEqual([
      {
        op: 'insert',
        table: 'selection_steps',
        args: ['ES', 'Webテスト', '一次面接', '二次面接', '最終面接'].map((label) =>
          expect.objectContaining({ company_id: 'c1', label }),
        ),
      },
    ])
    // 並び順は送らない（DB が末尾に付ける）
    expect((calls[0]!.args as object[])[0]).not.toHaveProperty('position')
  })

  it('テンプレートから1件追加し、名前を変えられる。筆記試験も選べる（B-5）', async () => {
    const user = userEvent.setup()
    renderSection([])
    await user.click(screen.getByRole('button', { name: 'ステップを追加' }))
    await user.click(screen.getByRole('button', { name: '筆記試験' }))
    const name = screen.getByLabelText('名前')
    await user.clear(name)
    await user.type(name, '一般常識テスト')
    await user.click(screen.getByRole('button', { name: '追加' }))
    expect(calls[0]!.args).toEqual([{ company_id: 'c1', kind: 'written_exam', label: '一般常識テスト' }])
  })

  it('結果待ちのステップが複数あっても、それぞれに通過・不合格を出す', () => {
    renderSection([step('s1', '一次面接', 'awaiting_result', 0), step('s2', 'Webテスト', 'awaiting_result', 1)])
    for (const name of ['一次面接', 'Webテスト']) {
      const card = screen.getByRole('listitem', { name })
      expect(within(card).getByRole('button', { name: '通過' })).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: '不合格' })).toBeInTheDocument()
    }
  })

  it('「提出した／受けた」で結果待ちにし、完了日時を記録する', async () => {
    const user = userEvent.setup()
    renderSection([step('s1', 'ES', 'not_started', 0)])
    await user.click(screen.getByRole('button', { name: '提出した／受けた' }))
    expect(calls[0]).toEqual({
      op: 'update',
      table: 'selection_steps',
      args: { id: 's1', values: { status: 'awaiting_result', completed_at: expect.any(String) } },
    })
  })

  it('上下ボタンで、全ステップの新しい並びを RPC に送る', async () => {
    const user = userEvent.setup()
    renderSection([
      step('s1', 'ES', 'passed', 0),
      step('s2', '一次面接', 'not_started', 1),
      step('s3', '二次', 'not_started', 2),
    ])
    expect(screen.getByRole('button', { name: 'ESを上へ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '二次を下へ' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '一次面接を上へ' }))
    expect(calls[0]).toEqual({
      op: 'rpc',
      args: { name: 'reorder_steps', p_company_id: 'c1', p_step_ids: ['s2', 's1', 's3'] },
    })
  })

  it('削除は確認してから行う', async () => {
    const user = userEvent.setup()
    renderSection([step('s1', 'ES', 'not_started', 0)])
    await user.click(screen.getByRole('button', { name: '削除' }))
    expect(calls).toEqual([])
    await user.click(screen.getByRole('button', { name: '削除する' }))
    expect(calls[0]).toEqual({ op: 'delete', table: 'selection_steps', args: 's1' })
  })

  it('詳細編集で「実施/提出済み」にできる（B-1）', async () => {
    const user = userEvent.setup()
    renderSection([step('s1', 'ES', 'awaiting_result', 0)])
    await user.click(screen.getByRole('button', { name: '編集' }))
    const sheet = screen.getByRole('dialog', { name: 'ステップを編集' })
    await user.selectOptions(within(sheet).getByLabelText('状態'), 'done')
    await user.click(within(sheet).getByRole('button', { name: '保存' }))
    expect(calls[0]).toMatchObject({ op: 'update', args: { id: 's1', values: { status: 'done' } } })
  })

  it('「予定を入れる」は対応予定にして編集を開く', async () => {
    const user = userEvent.setup()
    renderSection([step('s1', '一次面接', 'not_started', 0)])
    await user.click(screen.getByRole('button', { name: '予定を入れる' }))
    const sheet = screen.getByRole('dialog', { name: 'ステップを編集' })
    expect(within(sheet).getByLabelText('状態')).toHaveValue('scheduled')
    await user.type(within(sheet).getByLabelText('実施日時'), '2026-10-20T14:00')
    await user.click(within(sheet).getByRole('button', { name: '保存' }))
    expect(calls[0]).toMatchObject({
      args: { values: { status: 'scheduled', scheduled_at: '2026-10-20T05:00:00.000Z' } },
    })
  })

  it('ゴミ箱内の企業では操作を出さない', () => {
    renderSection([step('s1', 'ES', 'not_started', 0)], true)
    expect(screen.queryByRole('button', { name: 'ステップを追加' })).toBeNull()
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
  })
})
