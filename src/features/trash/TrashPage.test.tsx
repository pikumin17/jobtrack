import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { TrashPage } from './TrashPage'

const { rpcs } = vi.hoisted(() => ({ rpcs: [] as unknown[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        not: () => ({
          order: async () => ({ data: [{ id: 'c1', name: 'A商事', deleted_at: '2026-10-13T00:00:00Z' }], error: null }),
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      rpcs.push({ name, args })
      return { error: null }
    },
  },
}))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  rpcs.length = 0
})

describe('ゴミ箱', () => {
  it('復元する', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      within(await screen.findByRole('listitem', { name: 'A商事' })).getByRole('button', { name: '復元' }),
    )
    expect(rpcs).toEqual([{ name: 'restore_company', args: { p_company_id: 'c1' } }])
  })

  it('完全削除は、元に戻せないことを確認してから行う', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      within(await screen.findByRole('listitem', { name: 'A商事' })).getByRole('button', { name: '完全に削除' }),
    )
    const sheet = screen.getByRole('dialog', { name: '「A商事」を完全に削除しますか？' })
    expect(within(sheet).getByText('完全に削除すると元に戻せません。')).toBeInTheDocument()
    expect(rpcs).toEqual([])
    await user.click(within(sheet).getByRole('button', { name: '完全に削除する' }))
    expect(rpcs).toEqual([{ name: 'purge_company', args: { p_company_id: 'c1' } }])
  })
})
