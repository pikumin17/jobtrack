import type { Session } from '@supabase/supabase-js'
import { createContext, use } from 'react'

export type AuthState = { session: Session | null; loading: boolean }

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth は AuthProvider の内側で使ってください')
  return value
}
