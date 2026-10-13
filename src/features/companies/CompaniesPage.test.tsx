import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { CompanyListItem } from './api'
import { CompaniesPage } from './CompaniesPage'

const { data } = vi.hoisted(() => ({ data: { companies: [] as unknown[], steps: [] as unknown[] } }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'companies'
        ? { select: () => ({ is: () => ({ order: async () => ({ data: data.companies, error: null }) }) }) }
        : { select: async () => ({ data: data.steps, error: null }) },
  },
}))

function company(id: string, name: string, overrides: Partial<CompanyListItem> = {}): CompanyListItem {
  return {
    id,
    name,
    preference: null,
    application_status: 'not_applied',
    applied_on: null,
    application_type: null,
    job_type: null,
    memo: null,
    selection_status: 'not_started',
    selection_status_reason: null,
    final_outcome: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T03:00:00Z') })
  data.companies = [
    company('a', 'A商事', {
      preference: 5,
      application_status: 'applied',
      applied_on: '2026-10-01',
      selection_status: 'in_progress',
    }),
    company('b', 'B工業'),
  ]
  data.steps = [
    {
      id: 's1',
      company_id: 'a',
      position: 0,
      label: '一次面接',
      status: 'awaiting_result',
      deadline_date: null,
      deadline_at: null,
      scheduled_at: null,
      scheduled_end_at: null,
      completed_at: '2026-10-07T03:00:00Z',
      result_expected_on: null,
    },
    {
      id: 's2',
      company_id: 'a',
      position: 1,
      label: '二次面接',
      status: 'scheduled',
      deadline_date: null,
      deadline_at: null,
      scheduled_at: '2026-10-17T05:00:00Z',
      scheduled_end_at: null,
      completed_at: null,
      result_expected_on: null,
    },
  ]
})
afterEach(() => vi.useRealTimers())

describe('企業一覧', () => {
  it('コンパクト一覧: 2行目に次回予定、右に結果待ちの件数（結果待ちと次回予定を同時に）', async () => {
    renderPage()
    const a = await screen.findByRole('link', { name: /A商事/ })
    expect(a).toHaveTextContent('次: 二次面接 10/17(土) 14:00 あと3日')
    expect(a).toHaveTextContent('結果待ち 1')
    expect(screen.getByRole('link', { name: /B工業/ })).toHaveTextContent('予定なし')
  })

  it('次の予定が近い順が既定で、予定のない企業は後ろ', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: '企業一覧' })
    expect(
      within(list)
        .getAllByRole('link')
        .map((l) => l.textContent?.slice(0, 3)),
    ).toEqual(['A商事', 'B工業'])
  })

  it('絞り込みの志望度「未設定」は志望度のない企業だけ', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPage()
    await screen.findByRole('link', { name: /A商事/ })
    await user.click(screen.getByRole('button', { name: '絞り込み' }))
    const sheet = screen.getByRole('dialog', { name: '絞り込み' })
    await user.click(within(within(sheet).getByRole('group', { name: '志望度' })).getByLabelText('未設定'))
    await user.click(within(sheet).getByRole('button', { name: '1社を表示' }))
    expect(screen.queryByRole('link', { name: /A商事/ })).toBeNull()
    expect(screen.getByRole('link', { name: /B工業/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '絞り込み（1）' })).toBeInTheDocument()
  })

  it('検索で絞り込み、該当なしなら条件を外せる', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByRole('searchbox'), '存在しない')
    expect(screen.getByText('条件に合う企業はありません')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '条件をすべて外す' }))
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('詳細カードに切り替えると端末に記憶する', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '詳細カード' }))
    expect(screen.getByRole('link', { name: /A商事/ })).toHaveTextContent('5 第一志望')
    expect(screen.getByRole('link', { name: /A商事/ })).toHaveTextContent('結果待ち 一次面接（7日経過）')
    expect(localStorage.getItem('jobtrack.companies.view')).toBe('card')
  })
})
