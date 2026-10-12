import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useAuth } from './auth-context'
import { readError } from './callbackError'

// Google から戻ってきた直後の画面。コードとセッションの交換は supabase-js が自動で行う。
export function AuthCallbackPage() {
  const { session } = useAuth()
  const [failure] = useState(() => readError(window.location))
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (failure) return
    const timer = window.setTimeout(() => setTimedOut(true), 15000)
    return () => window.clearTimeout(timer)
  }, [failure])

  if (failure === 'not_invited') return <Navigate to="/not-invited" replace />
  if (failure) return <Navigate to="/login?error=callback" replace />
  if (session) return <Navigate to="/" replace />
  if (timedOut) return <Navigate to="/login?error=timeout" replace />
  return <LoadingScreen label="ログインしています…" />
}
