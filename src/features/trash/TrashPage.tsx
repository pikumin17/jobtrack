import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { Sheet } from '@/components/ui/Sheet'
import { formatJstShort } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { usePurgeCompany, useRestoreCompany, useTrashedCompanies, type TrashedCompany } from './api'

// ゴミ箱（設計書 02 §3.9）。復元するとステップ・履歴を含めて元に戻る。完全削除はその企業の履歴も消し、元に戻せない
export function TrashPage() {
  const trashed = useTrashedCompanies()
  const restore = useRestoreCompany()
  const purge = usePurgeCompany()
  const [purging, setPurging] = useState<TrashedCompany | null>(null)

  return (
    <>
      <nav className="mb-3">
        <Link to="/more" className="inline-flex min-h-11 items-center text-sm font-semibold text-sage-700">
          ← その他
        </Link>
      </nav>
      <PageHeader title="ゴミ箱" />
      {restore.isError && (
        <div className="mb-3">
          <ErrorMessage message={userFacingMessage(restore.error, '復元できませんでした。もう一度お試しください。')} />
        </div>
      )}
      {trashed.isPending ? (
        <LoadingScreen />
      ) : trashed.isError ? (
        <ErrorMessage message="ゴミ箱を読み込めませんでした。" />
      ) : trashed.data.length === 0 ? (
        <EmptyState title="ゴミ箱は空です">企業詳細の「ゴミ箱に入れる」で移した企業がここに出ます。</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" aria-label="ゴミ箱の企業">
          {trashed.data.map((c) => (
            <li key={c.id} aria-label={c.name} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <Link to={`/companies/${c.id}`} className="font-semibold break-all underline">
                  {c.name}
                </Link>
                {c.deleted_at && (
                  <span className="block text-xs text-muted">{formatJstShort(c.deleted_at)} にゴミ箱へ</span>
                )}
              </span>
              <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(c.id)}>
                復元
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  purge.reset()
                  setPurging(c)
                }}
              >
                完全に削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {purging && (
        <Sheet
          title={`「${purging.name}」を完全に削除しますか？`}
          onClose={() => setPurging(null)}
          busy={purge.isPending}
        >
          <p className="text-sm">企業の情報・選考ステップ・履歴がすべて消えます。</p>
          <p className="mt-2 text-sm font-semibold text-danger">完全に削除すると元に戻せません。</p>
          {purge.isError && (
            <div className="mt-3">
              <ErrorMessage
                message={userFacingMessage(purge.error, '削除できませんでした。もう一度お試しください。')}
              />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPurging(null)} disabled={purge.isPending}>
              やめる
            </Button>
            <Button
              variant="danger"
              disabled={purge.isPending}
              onClick={async () => {
                try {
                  await purge.mutateAsync(purging.id)
                  setPurging(null)
                } catch {
                  // purge.error で表示
                }
              }}
            >
              {purge.isPending ? '削除中…' : '完全に削除する'}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}
