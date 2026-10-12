import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from './AuthProvider'

type Listener = (event: string, session: Session | null) => void
const { state } = vi.hoisted(() => ({ state: { listener: null as Listener | null } }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => {
        state.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))

const as = (id: string) => ({ user: { id } }) as unknown as Session

function setup() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <p>child</p>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return client
}

describe('AuthProvider', () => {
  it('同じ人のトークン更新ではデータを消さない', () => {
    const client = setup()
    act(() => state.listener!('INITIAL_SESSION', as('a')))
    client.setQueryData(['companies'], ['A社'])
    act(() => state.listener!('TOKEN_REFRESHED', as('a')))
    expect(client.getQueryData(['companies'])).toEqual(['A社'])
  })

  it('別のアカウントに切り替わったら前の人のデータを消す', () => {
    const client = setup()
    act(() => state.listener!('INITIAL_SESSION', as('a')))
    client.setQueryData(['companies'], ['A社'])
    act(() => state.listener!('SIGNED_IN', as('b')))
    expect(client.getQueryData(['companies'])).toBeUndefined()
  })

  it('ログアウトされたらデータを消す', () => {
    const client = setup()
    act(() => state.listener!('INITIAL_SESSION', as('a')))
    client.setQueryData(['companies'], ['A社'])
    act(() => state.listener!('SIGNED_OUT', null))
    expect(client.getQueryData(['companies'])).toBeUndefined()
  })
})
