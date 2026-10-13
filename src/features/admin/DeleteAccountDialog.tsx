import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import type { DeleteAccountResult } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { confirmationMatches } from './api'

type Props = {
  email: string
  pending: boolean
  error: unknown
  onConfirm: (confirmEmail: string) => Promise<DeleteAccountResult>
  onClose: () => void
}

// 削除される内容。件数や企業名は出さない（管理者でも他人の就活データは見ない。設計書 03 §3）
const DELETED_ITEMS = [
  'Googleログインの情報（ログイン中の端末も使えなくなります）',
  'プロフィールと通知設定',
  '企業・応募・面接など、すべての就活データ',
  '招待（この一覧から消えます）',
  'Supabase に残るログイン記録',
]

// アカウント完全削除の二重確認。1回目で内容を確かめ、2回目で対象メールを手で入力する
export function DeleteAccountDialog({ email, pending, error, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 'done'>(1)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<DeleteAccountResult | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  async function confirm() {
    try {
      setResult(await onConfirm(typed))
      setStep('done')
    } catch {
      // error で表示
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-lg outline-none"
      >
        {step === 1 && (
          <>
            <h2 id={titleId} className="text-lg font-bold">アカウントを完全に削除しますか？（1/2）</h2>
            <p className="mt-3 text-sm">対象：<span className="font-semibold break-all">{email}</span></p>
            <p className="mt-3 text-sm">次のものがすべて削除されます。</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {DELETED_ITEMS.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-sm font-semibold text-danger">削除すると元に戻せません。再招待しても、データは戻りません。</p>
            <p className="mt-2 text-xs text-muted">管理操作の記録には、日時と操作の種類だけが残ります（メールアドレスは消えます）。</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>やめる</Button>
              <Button variant="danger" onClick={() => setStep(2)}>次へ</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 id={titleId} className="text-lg font-bold">確認のため、メールアドレスを入力してください（2/2）</h2>
            <p className="mt-3 text-sm">
              削除する <span className="font-semibold break-all">{email}</span> を、下の欄にそのまま入力してください。
            </p>
            <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold">削除するアカウントのメールアドレス</label>
            <input
              id="delete-confirm"
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
            />
            {error ? <div className="mt-3"><ErrorMessage message={userFacingMessage(error, '削除できませんでした。もう一度お試しください。')} /></div> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={pending}>やめる</Button>
              <Button variant="danger" onClick={confirm} disabled={!confirmationMatches(email, typed) || pending}>
                {pending ? '削除中…' : '完全に削除する'}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 id={titleId} className="text-lg font-bold">削除しました</h2>
            <p className="mt-3 text-sm break-all">{email} のアカウントとデータを削除しました。</p>
            {result?.auth_log_entries_deleted === null && (
              <p className="mt-2 text-sm text-muted">
                Supabase のログイン記録は、権限の都合で削除できませんでした。Supabase のログの保持期間が過ぎると自動で消えます。
              </p>
            )}
            <p className="mt-2 text-sm text-muted">Google Cloud のテストユーザーに登録している場合は、そちらからも外してください。</p>
            <div className="mt-6 flex justify-end">
              <Button onClick={onClose}>閉じる</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
