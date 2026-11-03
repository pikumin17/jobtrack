import { useMemo } from 'react'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useCompanies } from '@/features/companies/api'
import { compareEntries, compareOpenTasks, taskEntry } from '@/lib/calendar'
import { useTasks } from './api'
import { EntryList } from './EntryList'

const DONE_SHOWN = 20

// 個人タスクの一覧（期日のないものを含む）。未完了は期日の近い順、完了済みは最近のものだけ
export function TasksPanel() {
  const tasks = useTasks()
  const companies = useCompanies()
  const entries = useMemo(() => {
    if (!tasks.data || !companies.data) return undefined
    const active = new Map(companies.data.map((c) => [c.id, c.name]))
    // ゴミ箱の企業に紐付くタスクは出さない（カレンダーと同じ、02 §3.6）
    return tasks.data
      .filter((t) => t.company_id === null || active.has(t.company_id))
      .map((t) => taskEntry(t, t.company_id ? (active.get(t.company_id) ?? null) : null))
  }, [tasks.data, companies.data])

  if (tasks.isError || companies.isError) return <ErrorMessage message="タスクを読み込めませんでした。" />
  if (!entries) return <LoadingScreen />

  const open = entries.filter((e) => !e.done).sort(compareOpenTasks)
  const done = entries
    .filter((e) => e.done)
    .sort(compareEntries)
    .reverse()
    .slice(0, DONE_SHOWN)

  return (
    <section aria-label="タスク">
      <EntryList showDate entries={open} empty="未完了のタスクはありません。" />
      {done.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">
            完了したタスク（{done.length}件）
          </summary>
          <EntryList showDate entries={done} />
        </details>
      )}
    </section>
  )
}
