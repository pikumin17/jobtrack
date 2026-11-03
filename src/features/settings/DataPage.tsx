import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/auth-context'
import { checkBackup, type BackupCheck } from '@/lib/backup'
import type { BackupCounts } from '@/lib/database.types'
import { formatJstDateTime } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { currentCounts, downloadBackup, downloadCsv, restoreBackup } from './exports'

const CONFIRM_WORD = '復元する'

const COUNT_LABELS: [keyof BackupCounts, string][] = [
  ['companies', '企業'],
  ['selection_steps', '選考ステップ'],
  ['events', '予定'],
  ['tasks', 'タスク'],
]

// その他 → データの書き出し・復元（設計書 02 §6、D-01〜D-05）
export function DataPage() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const fileId = useId()
  const confirmId = useId()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [check, setCheck] = useState<Extract<BackupCheck, { ok: true }> | null>(null)
  const [checkErrors, setCheckErrors] = useState<string[]>([])
  const [current, setCurrent] = useState<BackupCounts | null>(null)
  const [savedCurrent, setSavedCurrent] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (e) {
      setError(userFacingMessage(e, '処理できませんでした。通信を確かめて、もう一度お試しください。'))
    } finally {
      setBusy(null)
    }
  }

  function resetRestore() {
    setCheck(null)
    setCheckErrors([])
    setCurrent(null)
    setSavedCurrent(false)
    setConfirmText('')
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    resetRestore()
    if (!file || !session) return
    await run('check', async () => {
      const result = await checkBackup(await file.text(), file.size, session.user.id)
      if (!result.ok) {
        setCheckErrors(result.errors)
        return
      }
      setCurrent(await currentCounts())
      setCheck(result)
    })
  }

  const canRestore = check !== null && savedCurrent && confirmText === CONFIRM_WORD && busy === null

  return (
    <>
      <PageHeader title="データの書き出し・復元" />
      <p className="mb-4 text-sm">
        <Link to="/more" className="text-sage-700">
          ‹ その他に戻る
        </Link>
      </p>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-xl border border-sage-500 bg-sage-100 px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <section aria-labelledby="csv-heading" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="csv-heading" className="font-semibold">
          CSV（表計算ソフト用）
        </h2>
        <p className="mt-1 text-sm text-muted">Excel で開けます。ゴミ箱の企業は含めません。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run('csv', () => downloadCsv('companies'))}
          >
            企業一覧のCSV
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => run('csv', () => downloadCsv('steps'))}>
            選考ステップのCSV
          </Button>
        </div>
      </section>

      <section aria-labelledby="backup-heading" className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 id="backup-heading" className="font-semibold">
          バックアップ（JSON）
        </h2>
        <p className="mt-1 text-sm text-muted">
          企業・ステップ・予定・タスク・履歴・プロフィールをすべて1つのファイルに保存します。ファイルには就活の記録がそのまま入るので、人に渡さないでください。
        </p>
        <Button
          className="mt-3"
          disabled={busy !== null}
          onClick={() =>
            run('backup', async () => {
              const counts = await downloadBackup()
              setNotice(
                `バックアップを保存しました（企業 ${counts.companies}件、ステップ ${counts.selection_steps}件）。`,
              )
            })
          }
        >
          {busy === 'backup' ? '書き出し中…' : 'バックアップを保存'}
        </Button>
      </section>

      <section aria-labelledby="restore-heading" className="mt-4 rounded-2xl border border-danger bg-surface p-4">
        <h2 id="restore-heading" className="font-semibold">
          バックアップから復元
        </h2>
        <p className="mt-1 text-sm text-muted">
          今のデータはすべて、バックアップの内容に置き換わります。自分で書き出したファイルだけを復元できます。
        </p>
        <label htmlFor={fileId} className="mt-3 block text-sm font-semibold">
          バックアップのファイル
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          disabled={busy !== null}
          className="mt-1 block w-full text-sm"
        />

        {checkErrors.length > 0 && (
          <div role="alert" className="mt-3 rounded-xl border border-danger bg-danger-bg p-3 text-sm text-danger">
            <p className="font-semibold">このファイルは復元できません</p>
            <ul className="mt-1 list-disc pl-5">
              {checkErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {check && current && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm">{formatJstDateTime(check.file.exported_at)} に書き出したバックアップです。</p>
              <table className="mt-2 w-full text-sm" aria-label="復元の前後の件数">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 font-semibold">
                      種類
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      今
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      復元後
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {COUNT_LABELS.map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {label}
                      </th>
                      <td className="py-1.5 text-right tabular-nums">{current[key]}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{check.counts[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {check.warnings.length > 0 && (
              <ul className="list-disc rounded-xl border border-warn bg-warn-bg p-3 pl-8 text-sm text-warn">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            <div>
              <p className="text-sm font-semibold">1. 念のため、今のデータを保存する</p>
              <Button
                variant="secondary"
                className="mt-2"
                disabled={busy !== null}
                onClick={() =>
                  run('backup', async () => {
                    await downloadBackup()
                    setSavedCurrent(true)
                  })
                }
              >
                {savedCurrent ? '保存しました' : '今のデータを保存'}
              </Button>
            </div>

            <div>
              <label htmlFor={confirmId} className="text-sm font-semibold">
                2. 確認のため「{CONFIRM_WORD}」と入力
              </label>
              <input
                id={confirmId}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={!savedCurrent}
                autoComplete="off"
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={resetRestore} disabled={busy !== null}>
                やめる
              </Button>
              <Button
                variant="danger"
                disabled={!canRestore}
                onClick={() =>
                  run('restore', async () => {
                    const counts = await restoreBackup(check.file)
                    resetRestore()
                    await queryClient.invalidateQueries()
                    setNotice(
                      `復元しました（企業 ${counts.companies}件、ステップ ${counts.selection_steps}件、予定 ${counts.events}件、タスク ${counts.tasks}件）。`,
                    )
                  })
                }
              >
                {busy === 'restore' ? '復元中…' : '置き換えて復元する'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
