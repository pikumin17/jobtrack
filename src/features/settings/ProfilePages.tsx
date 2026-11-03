import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Logo } from '@/components/ui/Logo'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProfile } from '@/features/auth/profile'
import { ProfileForm } from './ProfileForm'
import { useSaveProfile } from './profileApi'

// 初回設定（02 §2.2）。表示名・卒業予定年・利用目的はすべて任意で、スキップしても記録して二度と出さない
export function OnboardingPage() {
  const profile = useProfile()
  const save = useSaveProfile()
  const navigate = useNavigate()

  if (!profile.data) return <LoadingScreen />
  if (profile.data.onboarding_completed_at) return <Navigate to="/" replace />

  const finish = async (values: object) => {
    await save.mutateAsync({ ...values, onboarding_completed_at: new Date().toISOString() })
    navigate('/', { replace: true })
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-xl font-bold">JobTrack へようこそ</h1>
      <p className="mt-2 text-sm text-muted">
        よければ少しだけ教えてください。あとから「その他 → プロフィール」で変えられます。
      </p>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <ProfileForm
          profile={profile.data}
          submitLabel="はじめる"
          busy={save.isPending}
          error={save.error}
          onSubmit={finish}
          secondary={
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => void finish({}).catch(() => undefined)}
            >
              スキップ
            </Button>
          }
        />
      </div>
    </main>
  )
}

// その他 → プロフィール
export function ProfilePage() {
  const profile = useProfile()
  const save = useSaveProfile()
  const [saved, setSaved] = useState(false)

  if (!profile.data) return <LoadingScreen />
  return (
    <>
      <PageHeader title="プロフィール" />
      <p className="mb-4 text-sm">
        <Link to="/more" className="text-sage-700">
          ‹ その他に戻る
        </Link>
      </p>
      {saved && (
        <p role="status" className="mb-4 rounded-xl border border-sage-500 bg-sage-100 px-4 py-3 text-sm">
          保存しました。
        </p>
      )}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-4 text-sm text-muted break-all">ログイン中のアカウント: {profile.data.email}</p>
        <ProfileForm
          key={profile.data.updated_at}
          profile={profile.data}
          submitLabel="保存"
          busy={save.isPending}
          error={save.error}
          onSubmit={async (values) => {
            setSaved(false)
            await save.mutateAsync(values)
            setSaved(true)
          }}
        />
      </div>
    </>
  )
}
