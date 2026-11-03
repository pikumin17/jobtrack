import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import type { MemberRow } from '@/lib/database.types'
import { AuthContext } from '@/features/auth/auth-context'
import { AdminPage } from './AdminPage'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

function member(overrides: Partial<MemberRow>): MemberRow {
  return {
    email: 'x@example.com',
    note: null,
    invited_at: '2026-10-12T00:00:00Z',
    revoked_at: null,
    user_id: 'u',
    role: 'member',
    status: 'active',
    last_sign_in_at: null,
    ...overrides,
  }
}

const rows: MemberRow[] = [
  member({ email: 'me@example.com', role: 'admin', user_id: 'me' }),
  member({ email: 'active@example.com', user_id: 'a' }),
  member({ email: 'revoked@example.com', user_id: 'r', revoked_at: '2026-10-13T00:00:00Z', status: 'suspended' }),
  member({ email: 'other-admin@example.com', role: 'admin', user_id: 'oa', revoked_at: '2026-10-13T00:00:00Z' }),
]

function renderPage() {
  const session = { user: { id: 'me', email: 'Me@Example.com' } } as unknown as Session
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext value={{ session, loading: false }}>
        <AdminPage />
      </AuthContext>
    </QueryClientProvider>,
  )
}

function rowOf(email: string) {
  return screen.getByText(email).closest('li') as HTMLElement
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockImplementation(async (name: string) => {
    if (name === 'admin_list_members') return { data: rows, error: null }
    if (name === 'admin_delete_account')
      return { data: { auth_user_deleted: true, auth_log_entries_deleted: 3 }, error: null }
    return { data: null, error: null }
  })
})

describe('招待管理: 完全削除', () => {
  it('「完全に削除」は取り消し済みの一般メンバーにだけ出る（自分・管理者・利用中の人には出ない）', async () => {
    renderPage()
    await screen.findByText('revoked@example.com')
    expect(within(rowOf('revoked@example.com')).getByRole('button', { name: '完全に削除' })).toBeInTheDocument()
    for (const email of ['me@example.com', 'active@example.com', 'other-admin@example.com']) {
      expect(within(rowOf(email)).queryByRole('button', { name: '完全に削除' })).toBeNull()
    }
  })

  it('二重確認を経て、対象メールと再入力したメールでRPCを呼ぶ', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('revoked@example.com')
    await user.click(within(rowOf('revoked@example.com')).getByRole('button', { name: '完全に削除' }))
    await user.click(screen.getByRole('button', { name: '次へ' }))
    await user.type(screen.getByLabelText('削除するアカウントのメールアドレス'), 'Revoked@example.com')
    await user.click(screen.getByRole('button', { name: '完全に削除する' }))
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('admin_delete_account', {
      p_email: 'revoked@example.com',
      p_confirm_email: 'Revoked@example.com',
    })
  })
})
