import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/auth-context'
import { formatJstDateTime } from '@/lib/dates'
import type { MemberRow } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { inviteSchema, useInvite, useMembers, useRevoke } from './api'

export function AdminPage() {
  const members = useMembers()
  const invite = useInvite()
  const revoke = useRevoke()
  const { session } = useAuth()
  const myEmail = session?.user.email?.toLowerCase()
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = inviteSchema.safeParse({ email, note })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? '入力内容を確認してください')
      return
    }
    setFormError(null)
    try {
      await invite.mutateAsync(parsed.data)
      setEmail('')
      setNote('')
    } catch {
      // invite.isError で表示
    }
  }

  function confirmRevoke(row: MemberRow) {
    if (window.confirm(`${row.email} の招待を取り消しますか？\nデータは消えず、ログインとデータの利用だけが止まります。再招待すると元に戻ります。`)) {
      revoke.mutate(row.email)
    }
  }

  return (
    <>
      <PageHeader title="招待管理" />
      <p className="mb-4 text-sm text-muted">
        招待したGoogleアカウントだけがログインできます。管理者でも、ほかの人の就活データは見られません。
      </p>

      <form onSubmit={submit} className="mb-6 space-y-3 rounded-2xl border border-line bg-surface p-4" noValidate>
        <div>
          <label htmlFor="invite-email" className="text-sm font-semibold">Googleアカウントのメールアドレス</label>
          <input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="invite-note" className="text-sm font-semibold">メモ（任意）</label>
          <input
            id="invite-note"
            value={note}
            maxLength={100}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 本人の2つ目のアカウント"
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
          />
        </div>
        {formError && <p className="text-sm text-danger">{formError}</p>}
        {invite.isError && <ErrorMessage message={userFacingMessage(invite.error, '招待できませんでした。もう一度お試しください。')} />}
        <Button type="submit" disabled={invite.isPending}>{invite.isPending ? '招待中…' : '招待する'}</Button>
      </form>

      <h2 className="mb-2 font-bold">メンバー</h2>
      {revoke.isError && <div className="mb-3"><ErrorMessage message={userFacingMessage(revoke.error, '取り消しできませんでした。もう一度お試しください。')} /></div>}
      {members.isPending ? (
        <LoadingScreen />
      ) : members.isError ? (
        <ErrorMessage message="メンバー一覧を読み込めませんでした。" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {members.data.map((row) => {
            const revoked = row.revoked_at !== null
            return (
              <li key={row.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold break-all">
                    {row.email}
                    {row.role === 'admin' && <span className="ml-2 rounded-full bg-sage-100 px-2 py-0.5 text-xs text-sage-800">管理者</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {revoked ? '取り消し済み' : !row.user_id ? '未ログイン' : row.status === 'active' ? '利用中' : '停止中（「再招待」で有効にできます）'}
                    {row.note ? `・${row.note}` : ''}
                    {row.last_sign_in_at ? `・最終ログイン ${formatJstDateTime(row.last_sign_in_at)}` : ''}
                  </p>
                </div>
                {revoked || (row.user_id && row.status !== 'active') ? (
                  <Button variant="secondary" onClick={() => invite.mutate({ email: row.email, note: row.note ?? '' })}>
                    再招待
                  </Button>
                ) : row.email !== myEmail ? (
                  <Button variant="danger" onClick={() => confirmRevoke(row)}>取り消し</Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
