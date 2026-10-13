import { QueryClient } from '@tanstack/react-query'
import { signOutAndClear } from './signOut'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null as unknown })) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut } } }))

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  window.localStorage.clear()
})

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

  it('ログアウトの通信が失敗しても、端末のログイン情報は消える', async () => {
    window.localStorage.setItem('sb-abcdefgh-auth-token', '{"access_token":"x"}')
    window.localStorage.setItem('jobtrack.companies.view', 'card')
    window.localStorage.setItem('jobtrack.dismissedWarnings', '["x"]')
    signOut.mockResolvedValueOnce({ error: new Error('network') })
    await signOutAndClear(new QueryClient())
    expect(window.localStorage.getItem('sb-abcdefgh-auth-token')).toBeNull()
    expect(window.localStorage.getItem('jobtrack.dismissedWarnings')).toBeNull()
    expect(window.localStorage.getItem('jobtrack.companies.view')).toBe('card')
  })

  it('ログアウト処理が例外を投げても、端末のログイン情報は消える', async () => {
    window.localStorage.setItem('sb-abcdefgh-auth-token', 'x')
    signOut.mockRejectedValueOnce(new Error('boom'))
    await expect(signOutAndClear(new QueryClient())).rejects.toThrow('boom')
    expect(window.localStorage.getItem('sb-abcdefgh-auth-token')).toBeNull()
  })
})
