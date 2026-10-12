import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/lib/database.types'
import { AuthContext } from './auth-context'
import { RequireAdmin, RequireMember } from './guards'

const { signOut, maybeSingle } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}))

const session = { user: { id: 'user-a', email: 'a@example.com' } } as unknown as Session

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: 'user-a',
    email: 'a@example.com',
    role: 'member',
    status: 'active',
    display_name: null,
    graduation_year: null,
    purpose: null,
    onboarding_completed_at: null,
    created_at: '2026-10-12T00:00:00Z',
    updated_at: '2026-10-12T00:00:00Z',
    ...overrides,
  }
}

function renderGuarded(path: string, auth: { session: Session | null; loading: boolean }) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login</p> },
      { path: '/not-invited', element: <p>not invited</p> },
      { path: '/', element: <RequireMember><p>home</p></RequireMember> },
      { path: '/admin', element: <RequireMember><RequireAdmin><p>admin page</p></RequireAdmin></RequireMember> },
    ],
    { initialEntries: [path] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthContext value={auth}>
        <RouterProvider router={router} />
      </AuthContext>
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  signOut.mockClear()
  maybeSingle.mockReset()
})

describe('RequireMember', () => {
  it('有効なメンバーは画面を見られる', async () => {
    maybeSingle.mockResolvedValue({ data: profile({}), error: null })
    renderGuarded('/', { session, loading: false })
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('プロフィールが読めない（未招待・停止中）ならログアウトして招待外の画面へ', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const router = renderGuarded('/', { session, loading: false })
    expect(await screen.findByText('not invited')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/not-invited')
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('停止中のプロフィールでも招待外の画面へ', async () => {
    maybeSingle.mockResolvedValue({ data: profile({ status: 'suspended' }), error: null })
    renderGuarded('/', { session, loading: false })
    expect(await screen.findByText('not invited')).toBeInTheDocument()
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('読み込みエラーのときはログアウトせずにエラーを表示する', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'network' } })
    renderGuarded('/', { session, loading: false })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('RequireAdmin', () => {
  it('一般メンバーには管理画面を見せない', async () => {
    maybeSingle.mockResolvedValue({ data: profile({ role: 'member' }), error: null })
    renderGuarded('/admin', { session, loading: false })
    expect(await screen.findByText('このページは表示できません')).toBeInTheDocument()
    expect(screen.queryByText('admin page')).not.toBeInTheDocument()
  })

  it('管理者は管理画面を見られる', async () => {
    maybeSingle.mockResolvedValue({ data: profile({ role: 'admin' }), error: null })
    renderGuarded('/admin', { session, loading: false })
    expect(await screen.findByText('admin page')).toBeInTheDocument()
  })
})
