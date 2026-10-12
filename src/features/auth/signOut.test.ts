import { QueryClient } from '@tanstack/react-query'
import { signOutAndClear } from './signOut'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null })) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut } } }))

describe('signOutAndClear', () => {
  it('画面に残ったデータを消してからログアウトする（A-5）', async () => {
    const client = new QueryClient()
    client.setQueryData(['companies'], [{ id: '1', name: 'A社' }])
    let cachedAtSignOut: unknown = 'not called'
    signOut.mockImplementationOnce(async () => {
      cachedAtSignOut = client.getQueryData(['companies'])
      return { error: null }
    })
    await signOutAndClear(client)
    expect(cachedAtSignOut).toBeUndefined()
    expect(client.getQueryData(['companies'])).toBeUndefined()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
