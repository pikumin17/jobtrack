import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { compareEntries, compareOpenTasks, taskEntry, type CalendarEntry } from '@/lib/calendar'
import { todayJst } from '@/lib/dates'
import { useCompanyEventsAndTasks } from './api'
import { EntryList } from './EntryList'
import { EventSheet, TaskSheet } from './PlanSheets'

type Props = { companyId: string; companyName: string; readOnly: boolean }

// 企業詳細の「予定・タスク」欄。この企業に紐付けた説明会などの予定と、やることを追加・完了できる
export function CompanyPlansSection({ companyId, companyName, readOnly }: Props) {
  const plans = useCompanyEventsAndTasks(companyId)
  const [adding, setAdding] = useState<'event' | 'task' | null>(null)

  const events: CalendarEntry[] = (plans.data?.events ?? []).map((e) => ({
    source_table: 'events',
    source_id: e.id,
    company_id: null, // 同じ企業の画面なので企業名のリンクは出さない
    company_name: companyName,
    item_type: 'event',
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day_date: e.all_day_date,
    done: e.completed_at !== null,
    priority: null,
  }))
  const tasks = (plans.data?.tasks ?? []).map((t) => ({ ...taskEntry(t, companyName), company_id: null }))
  const entries = [
    ...events.filter((e) => !e.done).sort(compareEntries),
    ...tasks.filter((t) => !t.done).sort(compareOpenTasks),
    ...[...events, ...tasks].filter((e) => e.done).sort(compareEntries),
  ]

  return (
    <section aria-labelledby="plans-heading" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plans-heading" className="text-sm font-semibold text-muted">
          予定・タスク
        </h2>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAdding('event')}>
              予定を追加
            </Button>
            <Button variant="secondary" onClick={() => setAdding('task')}>
              タスクを追加
            </Button>
          </div>
        )}
      </div>
      <div className="mt-3">
        {plans.isError ? (
          <ErrorMessage message="予定・タスクを読み込めませんでした。" />
        ) : plans.data ? (
          <EntryList
            showDate
            readOnly={readOnly}
            entries={entries}
            empty="説明会などの予定や、やることを登録できます。"
          />
        ) : null}
      </div>
      {adding === 'event' && <EventSheet day={todayJst()} companyId={companyId} onClose={() => setAdding(null)} />}
      {adding === 'task' && <TaskSheet companyId={companyId} onClose={() => setAdding(null)} />}
    </section>
  )
}
