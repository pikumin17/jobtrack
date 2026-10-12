import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from './auth-context'
import { useProfile } from './profile'
import { signOutAndClear } from './signOut'

// ログイン済みかつ有効なメンバーだけを通す。画面の出し分けは利便性のためで、防御の本体は DB の RLS。
export function RequireMember({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const location = useLocation()
  const notMember = profile.isSuccess && (profile.data === null || profile.data.status !== 'active')

  useEffect(() => {
    if (notMember) void signOutAndClear(queryClient)
  }, [notMember, queryClient])

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (notMember) return <Navigate to="/not-invited" replace />
  if (profile.isError) {
    return (
      <div className="p-6">
        <ErrorMessage message="プロフィールを読み込めませんでした。通信状況を確認して、再読み込みしてください。" />
      </div>
    )
  }
  if (!profile.data) return <LoadingScreen />
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const profile = useProfile()
  if (!profile.data) return <LoadingScreen />
  if (profile.data.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-lg font-bold">このページは表示できません</h1>
        <p className="mt-2 text-sm text-muted">招待管理は管理者だけが使えます。</p>
      </div>
    )
  }
  return children
}
