import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/auth/profile'
import { signOutAndClear } from '@/features/auth/signOut'

export function MorePage() {
  const { session } = useAuth()
  const profile = useProfile()
  const queryClient = useQueryClient()

  async function logout() {
    try {
      await signOutAndClear(queryClient)
    } finally {
      // 画面を読み込み直して、メモリ上に残った状態も確実に消す（A-5, テスト 1-14）
      window.location.replace('/login')
    }
  }

  return (
    <>
      <PageHeader title="その他" />
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">ログイン中のアカウント</p>
        <p className="font-semibold break-all">{session?.user.email}</p>
      </section>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {profile.data?.role === 'admin' && (
          <li>
            <Link to="/more/admin" className="flex min-h-12 items-center px-4 font-semibold">招待管理</Link>
          </li>
        )}
        <li className="flex min-h-12 items-center px-4 text-muted">設定・通知・バックアップ（フェーズ3〜4で追加）</li>
      </ul>
      <Button variant="secondary" className="mt-6 w-full" onClick={logout}>ログアウト</Button>
    </>
  )
}
