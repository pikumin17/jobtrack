import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from './auth-context'
import { AuthCallbackPage } from './AuthCallbackPage'

const { auth } = vi.hoisted(() => ({
  auth: { initialize: vi.fn(), getSession: vi.fn() },
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))

function renderCallback(url: string, session: Session | null = null) {
  window.history.replaceState(null, '', url)
  const router = createMemoryRouter(
    [
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/login', element: <p>login</p> },
      { path: '/not-invited', element: <p>not invited</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/auth/callback'] },
  )
  render(
    <AuthContext value={{ session, loading: false }}>
      <RouterProvider router={router} />
    </AuthContext>,
  )
  return router
}

beforeEach(() => {
  auth.initialize.mockReset().mockResolvedValue({ error: null })
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null } })
})

describe('AuthCallbackPage', () => {
  it('招待判定で拒否されたら招待外の画面へ', async () => {
    renderCallback('/auth/callback?error=access_denied&error_description=' + encodeURIComponent('このアカウントは招待されていません'))
    expect(await screen.findByText('not invited')).toBeInTheDocument()
  })

  it('その他のエラーはログイン画面へ', async () => {
    const router = renderCallback('/auth/callback?error=server_error&error_description=oops')
    await screen.findByText('login')
    expect(router.state.location.search).toBe('?error=callback')
  })

  it('コードの交換に失敗したら、待たずにログイン画面へ', async () => {
    auth.initialize.mockResolvedValue({ error: new Error('invalid flow state') })
    const router = renderCallback('/auth/callback?code=used')
    await screen.findByText('login')
    expect(router.state.location.search).toBe('?error=exchange')
  })

  it('コードなしで直接開いた場合もログイン画面へ', async () => {
    const router = renderCallback('/auth/callback')
    await screen.findByText('login')
    expect(router.state.location.search).toBe('?error=exchange')
  })

  it('ログインできたらホームへ', async () => {
    renderCallback('/auth/callback?code=ok', { user: { id: 'a' } } as unknown as Session)
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
})
