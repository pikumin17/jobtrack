import type { CompanySummary } from '@/lib/companySummary'
import type { InputWarning } from '@/lib/inputWarnings'
import { awaitingText, daysLeftText, scheduleText } from './summaryText'

const stepHref = (stepId: string) => `#step-${stepId}`

// 企業詳細の上部: 期限超過（全件）・結果待ち（全件）・次回予定（近い順に3件＋他n件）・注意（02 §2.4 詳細カード）
export function SummaryBlocks({
  summary,
  warnings,
  now,
}: {
  summary: CompanySummary
  warnings: InputWarning[]
  now?: Date
}) {
  const { overdue, awaiting, next, notices } = summary
  const attention = notices.length + warnings.length
  if (overdue.length + awaiting.length + next.length + attention === 0) return null
  return (
    <div className="space-y-3">
      {overdue.length > 0 && (
        <section aria-label="期限超過" className="rounded-2xl border-2 border-danger bg-surface p-4">
          <h2 className="text-sm font-semibold text-danger">期限超過 {overdue.length}件</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.map((o) => (
              <li key={`${o.stepId}-${o.source}`}>
                <a href={stepHref(o.stepId)} className="text-danger underline">
                  {o.message}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {awaiting.length > 0 && (
        <section aria-label="結果待ち" className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-warn">結果待ち {awaiting.length}件</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {awaiting.map((a) => (
              <li key={a.stepId} className={a.overdueDays > 0 ? 'font-semibold text-danger' : ''}>
                <a href={stepHref(a.stepId)} className="underline">
                  {awaitingText(a)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {next.length > 0 && (
        <section aria-label="次回予定" className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-muted">次回予定</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {next.slice(0, 3).map((i) => (
              <li key={`${i.stepId}-${i.source}`}>
                <a href={stepHref(i.stepId)} className="underline">
                  {scheduleText(i)}
                </a>{' '}
                <span className="text-muted">{daysLeftText(i, now)}</span>
              </li>
            ))}
          </ul>
          {next.length > 3 && <p className="mt-1 text-xs text-muted">他{next.length - 3}件</p>}
        </section>
      )}
      {attention > 0 && (
        <section aria-label="注意" className="rounded-2xl border border-line bg-warn-bg p-4">
          <h2 className="text-sm font-semibold text-warn">⚠ 注意 {attention}件</h2>
          <ul className="mt-2 space-y-1 text-sm text-warn">
            {notices.map((n) => (
              <li key={n.code}>
                {n.code === 'not_applied_progress' ? (
                  <a href="#application" className="underline">
                    {n.message}（応募状態へ）
                  </a>
                ) : (
                  n.message
                )}
              </li>
            ))}
            {warnings.map((w) => (
              <li key={w.fingerprint}>
                <a href={w.stepId ? stepHref(w.stepId) : '#application'} className="underline">
                  {w.message}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
