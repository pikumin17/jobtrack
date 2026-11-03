import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { entriesBetween, groupByDay } from '@/lib/calendar'
import {
  addDaysToDate,
  addMonths,
  formatJstDate,
  formatMonth,
  monthOf,
  monthWeeks,
  todayJst,
  weekdayOf,
  type DateOnly,
} from '@/lib/dates'
import { useCalendarItems } from './api'
import { EntryList } from './EntryList'
import { EventSheet, TaskSheet } from './PlanSheets'
import { TasksPanel } from './TasksPanel'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const UPCOMING_DAYS = 30

type View = 'month' | 'upcoming' | 'tasks'

// カレンダー（設計書 02 §3.6、D8）。月の表と、選んだ日の一覧。予定・タスクはここから追加・編集・完了できる
export function CalendarPage() {
  const today = todayJst()
  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(monthOf(today))
  const [selected, setSelected] = useState<DateOnly>(today)
  const [adding, setAdding] = useState<'event' | 'task' | null>(null)
  const items = useCalendarItems()
  const byDay = useMemo(() => groupByDay(items.data ?? []), [items.data])

  const tabs: [View, string][] = [
    ['month', '月'],
    ['upcoming', 'これから'],
    ['tasks', 'タスク'],
  ]

  return (
    <>
      <PageHeader
        title="カレンダー"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAdding('event')}>
              予定を追加
            </Button>
            <Button onClick={() => setAdding('task')}>タスクを追加</Button>
          </div>
        }
      />

      <div
        role="group"
        aria-label="表示の切替"
        className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className="min-h-10 rounded-lg px-4 text-sm font-semibold text-muted aria-pressed:bg-sage-700 aria-pressed:text-white"
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'tasks' ? (
        <TasksPanel />
      ) : items.isError ? (
        <ErrorMessage message="カレンダーを読み込めませんでした。" />
      ) : !items.data ? (
        <LoadingScreen />
      ) : view === 'upcoming' ? (
        <section aria-label="これからの予定">
          <p className="mb-2 text-sm text-muted">今日から{UPCOMING_DAYS}日間（完了したものを除く）</p>
          <EntryList
            showDate
            entries={entriesBetween(
              items.data.filter((e) => !e.done),
              today,
              addDaysToDate(today, UPCOMING_DAYS - 1),
            )}
            empty="これからの予定はありません。"
          />
        </section>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button variant="ghost" aria-label="前の月" onClick={() => setMonth((m) => addMonths(m, -1))}>
              ‹
            </Button>
            <h2 className="text-lg font-bold" aria-live="polite">
              {formatMonth(month)}
            </h2>
            <Button variant="ghost" aria-label="次の月" onClick={() => setMonth((m) => addMonths(m, 1))}>
              ›
            </Button>
          </div>
          <div className="mb-2 text-right">
            <button
              type="button"
              className="min-h-10 px-2 text-sm font-semibold text-sage-700"
              onClick={() => {
                setMonth(monthOf(today))
                setSelected(today)
              }}
            >
              今日へ
            </button>
          </div>

          <table className="w-full table-fixed border-collapse text-center" aria-label={`${formatMonth(month)}の予定`}>
            <thead>
              <tr>
                {WEEKDAYS.map((w, i) => (
                  <th
                    key={w}
                    scope="col"
                    className={`pb-1 text-xs font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-sage-700' : 'text-muted'}`}
                  >
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks(month).map((week) => (
                <tr key={week[0]}>
                  {week.map((day) => {
                    const entries = byDay.get(day) ?? []
                    const open = entries.filter((e) => !e.done).length
                    const inMonth = monthOf(day) === month
                    const dayNumber = Number(day.slice(8))
                    return (
                      <td key={day} className="p-0.5">
                        <button
                          type="button"
                          aria-pressed={selected === day}
                          aria-label={`${formatJstDate(day)} ${entries.length > 0 ? `${entries.length}件` : '予定なし'}`}
                          onClick={() => {
                            setSelected(day)
                            if (!inMonth) setMonth(monthOf(day))
                          }}
                          className={`flex min-h-12 w-full flex-col items-center justify-start rounded-lg pt-1 text-sm aria-pressed:bg-sage-700 aria-pressed:text-white ${
                            inMonth ? '' : 'text-muted/60'
                          } ${day === today ? 'font-bold ring-2 ring-sage-500' : ''} ${
                            weekdayOf(day) === 0 && inMonth ? 'text-danger' : ''
                          }`}
                        >
                          <span>{dayNumber}</span>
                          {entries.length > 0 && (
                            <span
                              aria-hidden
                              className={`mt-0.5 rounded-full px-1.5 text-[10px] leading-4 font-semibold ${
                                open > 0 ? 'bg-warn-bg text-warn' : 'bg-cream text-muted'
                              }`}
                            >
                              {entries.length}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <section aria-labelledby="day-heading" className="mt-4">
            <h2 id="day-heading" className="mb-2 text-sm font-semibold text-muted">
              {formatJstDate(selected)}
            </h2>
            <EntryList entries={byDay.get(selected) ?? []} />
          </section>
        </>
      )}

      {adding === 'event' && <EventSheet day={view === 'month' ? selected : today} onClose={() => setAdding(null)} />}
      {adding === 'task' && <TaskSheet onClose={() => setAdding(null)} />}
    </>
  )
}
