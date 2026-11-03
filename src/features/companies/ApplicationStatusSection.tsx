import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Sheet } from '@/components/ui/Sheet'
import type { Company } from '@/lib/database.types'
import { formatJstShort, todayJst } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { useSetApplication } from './api'
import { appliedOnSchema } from './schema'
import { WarningNote } from './WarningNote'
import type { InputWarning } from '@/lib/inputWarnings'

type Mode = null | 'apply' | 'change-date' | 'unapply'

// 応募状態欄（設計書 02 §2.4 企業詳細画面、§3.5.1）。ステップとは独立に、利用者の操作だけで変わる
export function ApplicationStatusSection({
  company,
  readOnly,
  warnings = [],
  onKeepAsIs,
}: {
  company: Company
  readOnly: boolean
  warnings?: InputWarning[]
  onKeepAsIs?: (fingerprint: string) => void
}) {
  const setApplication = useSetApplication(company.id)
  const [mode, setMode] = useState<Mode>(null)
  const [date, setDate] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)

  const open = (next: Mode) => {
    setApplication.reset()
    setDateError(null)
    setDate(company.applied_on ?? todayJst())
    setMode(next)
  }
  const close = () => setMode(null)

  async function save(appliedOn: string | null) {
    if (appliedOn !== null) {
      const parsed = appliedOnSchema.safeParse(appliedOn)
      if (!parsed.success) {
        setDateError(parsed.error.issues[0]?.message ?? '応募日を正しく入力してください')
        return
      }
    }
    try {
      await setApplication.mutateAsync(appliedOn)
      close()
    } catch {
      // setApplication.error で表示
    }
  }

  const applied = company.application_status === 'applied' && company.applied_on

  return (
    <section
      id="application"
      aria-labelledby="application-heading"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <h2 id="application-heading" className="text-sm font-semibold text-muted">
        応募状態
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold">
          {applied ? `応募済み ${formatJstShort(company.applied_on!)}` : '未応募'}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {applied ? (
              <>
                <Button variant="secondary" onClick={() => open('change-date')}>
                  応募日を変更
                </Button>
                <Button variant="ghost" onClick={() => open('unapply')}>
                  未応募に戻す
                </Button>
              </>
            ) : (
              <Button onClick={() => open('apply')}>応募済みにする</Button>
            )}
          </div>
        )}
      </div>
      {warnings.map((w) => (
        <WarningNote key={w.fingerprint} warning={w} onKeepAsIs={onKeepAsIs} />
      ))}

      {(mode === 'apply' || mode === 'change-date') && (
        <Sheet
          title={mode === 'apply' ? '応募済みにする' : '応募日を変更'}
          onClose={close}
          busy={setApplication.isPending}
        >
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void save(date)
            }}
          >
            <label htmlFor="applied-on" className="text-sm font-semibold">
              応募日
            </label>
            <input
              id="applied-on"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? 'applied-on-error' : undefined}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
            />
            {dateError && (
              <p id="applied-on-error" className="mt-1 text-sm text-danger">
                {dateError}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">選考ステップは変わりません。</p>
            {setApplication.isError && (
              <div className="mt-3">
                <ErrorMessage
                  message={userFacingMessage(setApplication.error, '保存できませんでした。もう一度お試しください。')}
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={setApplication.isPending}>
                やめる
              </Button>
              <Button type="submit" disabled={setApplication.isPending}>
                {setApplication.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </form>
        </Sheet>
      )}

      {mode === 'unapply' && (
        <Sheet title="未応募に戻しますか？" onClose={close} busy={setApplication.isPending}>
          <p className="text-sm">応募日は空になります。以前の応募日は履歴に残ります。</p>
          <p className="mt-2 text-sm font-semibold">選考ステップは変更されません。</p>
          {setApplication.isError && (
            <div className="mt-3">
              <ErrorMessage
                message={userFacingMessage(setApplication.error, '保存できませんでした。もう一度お試しください。')}
              />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={setApplication.isPending}>
              やめる
            </Button>
            <Button variant="danger" onClick={() => void save(null)} disabled={setApplication.isPending}>
              {setApplication.isPending ? '保存中…' : '未応募に戻す'}
            </Button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
