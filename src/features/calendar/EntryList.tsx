import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useUpdateStep } from '@/features/steps/api'
import { ITEM_TYPE_LABELS, type CalendarEntry } from '@/lib/calendar'
import type { Task } from '@/lib/database.types'
import { formatJstShort, formatJstTime } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { useEvent, useTasks, useToggleDone } from './api'
import { EventSheet, TaskSheet } from './PlanSheets'

// ステップの「完了」は簡単操作の「提出した／受けた」と同じ（結果待ちにして完了日時を記録、02 §3.6）
const STEP_COMPLETABLE = ['es_deadline', 'test_deadline', 'deadline', 'step_scheduled']

const TYPE_STYLES: Record<CalendarEntry['item_type'], string> = {
  es_deadline: 'bg-warn-bg text-warn',
  test_deadline: 'bg-warn-bg text-warn',
  deadline: 'bg-warn-bg text-warn',
  step_scheduled: 'bg-sage-100 text-sage-800',
  result_expected: 'bg-cream text-muted border border-line',
  event: 'bg-sage-100 text-sage-800',
  task: 'bg-cream text-ink border border-line',
}

type Props = {
  entries: CalendarEntry[]
  // 日付も表示する（今後の一覧・ホーム）
  showDate?: boolean
  // 項目の右に出す補足（アラートの「あと2日」など）
  note?: (entry: CalendarEntry) => string | undefined
  empty?: string
  // ゴミ箱内の企業の画面では、完了・編集をさせない
  readOnly?: boolean
}

// カレンダーの項目の一覧。予定・タスクはその場で完了・編集、ステップは企業の詳細へ（元のデータを直接変える）
export function EntryList({
  entries,
  showDate = false,
  note,
  empty = 'この日の予定はありません。',
  readOnly = false,
}: Props) {
  const [editing, setEditing] = useState<{ table: 'events' | 'tasks'; id: string } | null>(null)
  const toggle = useToggleDone()
  const updateStep = useUpdateStep()
  const tasks = useTasks()
  const error = toggle.error ?? updateStep.error

  if (entries.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
        {empty}
      </p>
    )

  return (
    <>
      {error && (
        <div className="mb-2">
          <ErrorMessage message={userFacingMessage(error, '更新できませんでした。もう一度お試しください。')} />
        </div>
      )}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {entries.map((entry) => {
          const when = entry.starts_at
            ? showDate
              ? formatJstShort(entry.starts_at, true)
              : formatJstTime(entry.starts_at)
            : !entry.all_day_date
              ? '期日なし'
              : showDate
                ? `${formatJstShort(entry.all_day_date)} 終日`
                : '終日'
          const isPlan = entry.source_table !== 'selection_steps'
          const extra = note?.(entry)
          const label = `${ITEM_TYPE_LABELS[entry.item_type]} ${entry.title}`
          return (
            <li
              key={`${entry.item_type}-${entry.source_id}`}
              aria-label={label}
              className="flex items-start gap-3 px-4 py-3"
            >
              {isPlan && (
                <input
                  type="checkbox"
                  aria-label={`${entry.title}を${entry.done ? '未完了に戻す' : '完了にする'}`}
                  checked={entry.done}
                  disabled={readOnly || toggle.isPending}
                  onChange={(e) =>
                    toggle.mutate({
                      table: entry.source_table as 'events' | 'tasks',
                      id: entry.source_id,
                      done: e.target.checked,
                    })
                  }
                  className="mt-1 size-5 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${TYPE_STYLES[entry.item_type]}`}>
                    {ITEM_TYPE_LABELS[entry.item_type]}
                  </span>
                  <span className="text-muted">{when}</span>
                  {entry.priority === 1 && <span className="font-semibold text-danger">優先度 高</span>}
                  {extra && <span className="font-semibold text-warn">{extra}</span>}
                </div>
                {isPlan && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => setEditing({ table: entry.source_table as 'events' | 'tasks', id: entry.source_id })}
                    className={`mt-1 block min-h-6 text-left font-semibold break-all hover:underline ${entry.done ? 'text-muted line-through' : ''}`}
                  >
                    {entry.title}
                  </button>
                ) : (
                  <span className={`mt-1 block font-semibold break-all ${entry.done ? 'text-muted line-through' : ''}`}>
                    {entry.title}
                  </span>
                )}
                {entry.company_id && entry.company_name && (
                  <Link
                    to={`/companies/${entry.company_id}`}
                    className="mt-0.5 inline-block text-sm text-sage-700 underline-offset-2 hover:underline"
                  >
                    {entry.company_name}
                  </Link>
                )}
              </div>
              {!isPlan && !readOnly && !entry.done && STEP_COMPLETABLE.includes(entry.item_type) && (
                <button
                  type="button"
                  disabled={updateStep.isPending}
                  onClick={() =>
                    updateStep.mutate({
                      id: entry.source_id,
                      values: { status: 'awaiting_result', completed_at: new Date().toISOString() },
                    })
                  }
                  className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-xs font-semibold hover:bg-sage-100"
                >
                  提出した／受けた
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {editing?.table === 'events' && <EventEditor id={editing.id} onClose={() => setEditing(null)} />}
      {editing?.table === 'tasks' && (
        <TaskEditor task={tasks.data?.find((t) => t.id === editing.id)} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function EventEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const event = useEvent(id)
  if (!event.data) return null
  return <EventSheet event={event.data} onClose={onClose} />
}

function TaskEditor({ task, onClose }: { task: Task | undefined; onClose: () => void }) {
  if (!task) return null
  return <TaskSheet task={task} onClose={onClose} />
}
