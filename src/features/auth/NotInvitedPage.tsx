import { Link } from 'react-router'
import { Logo } from '@/components/ui/Logo'

export function NotInvitedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
        <Logo className="mx-auto size-12" />
        <h1 className="mt-4 text-xl font-bold">このアカウントは招待されていません</h1>
        <p className="mt-3 text-sm text-muted">
          JobTrack
          は招待制です。招待されたGoogleアカウントでログインしてください。招待が取り消された場合も、この画面が表示されます。
        </p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center font-semibold text-sage-700 underline">
          ログイン画面に戻る
        </Link>
      </div>
    </main>
  )
}
