import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { routes } from './router'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('ルーティングとガード', () => {
  it('未ログインで保護された画面を開くとログイン画面になる', async () => {
    const router = renderAt('/companies')
    expect(await screen.findByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('管理画面も未ログインではログイン画面になる', async () => {
    const router = renderAt('/more/admin')
    await screen.findByRole('button', { name: 'Googleでログイン' })
    expect(router.state.location.pathname).toBe('/login')
  })

  it('招待されていない画面は単独で表示できる', async () => {
    renderAt('/not-invited')
    expect(await screen.findByText('このアカウントは招待されていません')).toBeInTheDocument()
  })
})
