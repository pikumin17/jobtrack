import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'
import { readError } from './callbackError'

// Google から戻ってきた直後の画面。コードとセッションの交換は supabase-js が自動で行う。
export function AuthCallbackPage() {
  const { session } = useAuth()
  const [urlFailure] = useState(() => readError(window.location))
  const [exchangeFailed, setExchangeFailed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (urlFailure) return
    let active = true
    // 交換に失敗した場合（コードの使い回し、別の端末・ブラウザで開いた等）は、待たずにログイン画面へ戻す
    void supabase.auth.initialize().then(async ({ error }) => {
      if (!active) return
      if (error) return setExchangeFailed(true)
      const { data } = await supabase.auth.getSession()
      if (active && !data.session) setExchangeFailed(true)
    })
    const timer = window.setTimeout(() => setTimedOut(true), 15000)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [urlFailure])

  if (urlFailure === 'not_invited') return <Navigate to="/not-invited" replace />
  if (urlFailure) return <Navigate to="/login?error=callback" replace />
  if (session) return <Navigate to="/" replace />
  if (exchangeFailed) return <Navigate to="/login?error=exchange" replace />
  if (timedOut) return <Navigate to="/login?error=timeout" replace />
  return <LoadingScreen label="ログインしています…" />
}
