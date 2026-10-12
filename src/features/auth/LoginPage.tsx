import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Logo } from '@/components/ui/Logo'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error') ? 'ログインできませんでした。もう一度お試しください。' : null)

  if (!loading && session) return <Navigate to="/" replace />

  async function signIn() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError('Googleのログイン画面を開けませんでした。通信状況を確認してください。')
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
        <Logo className="mx-auto size-16" />
        <h1 className="mt-4 text-2xl font-bold">JobTrack</h1>
        <p className="mt-2 text-sm text-muted">招待されたGoogleアカウントでログインしてください。</p>
        <div className="mt-8 space-y-4">
          {error && <ErrorMessage message={error} />}
          <Button className="w-full" onClick={signIn} disabled={busy}>
            {busy ? 'Googleへ移動中…' : 'Googleでログイン'}
          </Button>
        </div>
      </div>
    </main>
  )
}
