import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Company } from '@/lib/database.types'
import { CompanyDetailPage } from './CompanyDetailPage'

// supabase.from('companies') の呼び出しを記録する簡易モック
const { state } = vi.hoisted(() => ({
  state: { company: null as Company | null, updates: [] as unknown[], updateError: null as unknown },
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.company, error: null }) }) }),
      update: (values: unknown) => ({
        eq: () => ({
          select: async () => {
            if (state.updateError) return { data: null, error: state.updateError }
            state.updates.push(values)
            state.company = { ...state.company!, ...(values as Partial<Company>) }
            return { data: [{ id: state.company.id }], error: null }
          },
        }),
      }),
    }),
  },
}))

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    user_id: 'u1',
    name: 'サンプル株式会社',
    application_type: null,
    preference: null,
    application_status: 'not_applied',
    applied_on: null,
    job_type: null,
    location: null,
    channel: null,
    recruit_url: null,
    mypage_url: null,
    login_id_hint: null,
    contact_person: null,
    memo: null,
    selection_status: 'not_started',
    selection_status_reason: null,
    final_outcome: null,
    final_outcome_at: null,
    closed_reason: null,
    deleted_at: null,
    created_at: '2026-10-12T00:00:00Z',
    updated_at: '2026-10-12T00:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.company = company()
  state.updates = []
  state.updateError = null
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T16:30:00Z') }) // JST 10/14 01:30
})
afterEach(() => vi.useRealTimers())

describe('企業詳細', () => {
  it('新しい企業は未応募で、任意項目は未入力と表示する', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'サンプル株式会社' })).toBeInTheDocument()
    expect(screen.getAllByText('未応募').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未入力')).toHaveLength(9)
    expect(screen.getByText('未設定')).toBeInTheDocument()
  })

  it('「応募済みにする」は JST の今日を初期値にし、応募状態と応募日を一緒に保存する', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '応募済みにする' }))
    const dialog = screen.getByRole('dialog', { name: '応募済みにする' })
    expect(within(dialog).getByLabelText('応募日')).toHaveValue('2026-10-14')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(state.updates).toEqual([{ application_status: 'applied', applied_on: '2026-10-14' }])
    expect(await screen.findByText('応募済み 10/14(水)')).toBeInTheDocument()
  })

  it('「未応募に戻す」は確認してから応募日を空にする。ステップは変えないと伝える', async () => {
    state.company = company({ application_status: 'applied', applied_on: '2026-10-01' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '未応募に戻す' }))
    const dialog = screen.getByRole('dialog', { name: '未応募に戻しますか？' })
    expect(within(dialog).getByText('選考ステップは変更されません。')).toBeInTheDocument()
    expect(state.updates).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: '未応募に戻す' }))
    expect(state.updates).toEqual([{ application_status: 'not_applied', applied_on: null }])
  })

  it('志望度は星で設定し、「未設定に戻す」で null にする', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '志望度 4 本命候補' }))
    expect(await screen.findByText('4 本命候補')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '未設定に戻す' }))
    expect(state.updates).toEqual([{ preference: 4 }, { preference: null }])
  })

  it('編集フォームで javascript: の URL は保存せず、項目の横にエラーを出す', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const dialog = screen.getByRole('dialog', { name: '企業情報を編集' })
    await user.type(within(dialog).getByLabelText('採用ページ'), 'javascript:alert(1)')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(
      within(dialog).getByText('採用ページは http:// か https:// で始まるURLを入力してください'),
    ).toBeInTheDocument()
    expect(state.updates).toEqual([])
  })

  it('編集フォームで任意項目を保存できる（空欄は null）', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const dialog = screen.getByRole('dialog', { name: '企業情報を編集' })
    expect(within(dialog).getByText('パスワードは入力しないでください。')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('職種'), '企画職')
    await user.selectOptions(within(dialog).getByLabelText('応募経路'), 'agent')
    await user.type(within(dialog).getByLabelText('採用ページ'), 'https://example.com/recruit')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(state.updates).toEqual([
      {
        name: 'サンプル株式会社',
        application_type: null,
        job_type: '企画職',
        location: null,
        channel: 'agent',
        recruit_url: 'https://example.com/recruit',
        mypage_url: null,
        login_id_hint: null,
        contact_person: null,
        memo: null,
      },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('link', { name: 'https://example.com/recruit' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('ゴミ箱内の企業は編集の操作を出さない', async () => {
    state.company = company({ deleted_at: '2026-10-13T00:00:00Z' })
    renderPage()
    expect(await screen.findByText(/ゴミ箱に入っています/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    expect(screen.queryByRole('button', { name: '応募済みにする' })).toBeNull()
    expect(screen.getByRole('button', { name: '志望度 3 興味あり' })).toBeDisabled()
  })

  it('見つからない企業（他人の企業を含む）は「見つかりません」と出す', async () => {
    state.company = null
    renderPage()
    expect(await screen.findByText('企業が見つかりません')).toBeInTheDocument()
  })

  it('DB が拒否したときは日本語の理由を出す', async () => {
    state.updateError = { code: '55000', message: 'ゴミ箱に入っている企業は変更できません。先に復元してください' }
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '志望度 5 第一志望' }))
    expect(await screen.findByText('ゴミ箱に入っている企業は変更できません。先に復元してください')).toBeInTheDocument()
  })
})
