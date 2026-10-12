import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const nextUserId = next?.user.id ?? null
      // 別タブでのログアウトや、別のアカウントへの切り替えでも、前の人のデータを画面に残さない（A-5）
      if (event === 'SIGNED_OUT' || (userIdRef.current !== undefined && userIdRef.current !== nextUserId)) {
        queryClient.clear()
      }
      userIdRef.current = nextUserId
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  return <AuthContext value={{ session, loading }}>{children}</AuthContext>
}
