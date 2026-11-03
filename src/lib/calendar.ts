// カレンダーの項目の並べ方と、アプリ内アラート（設計書 02 §3.6・§3.7）。
// アラートは DB に保存せず、読み込んだ項目から表示のたびにここで求める。ホームとカレンダーで共用する。
import type { CalendarItem, CalendarItemType } from './database.types'
import { addDaysToDate, calendarDaysBetweenJst, endOfJstDay, todayJst, toJstDate, type DateOnly } from './dates'

export type CalendarEntry = Pick<
  CalendarItem,
  | 'source_table'
  | 'source_id'
  | 'company_id'
  | 'company_name'
  | 'item_type'
  | 'title'
  | 'starts_at'
  | 'ends_at'
  | 'all_day_date'
  | 'done'
  | 'priority'
>

export const ITEM_TYPE_LABELS: Record<CalendarItemType, string> = {
  es_deadline: 'ES締切',
  test_deadline: 'テスト期限',
  deadline: '締切',
  step_scheduled: '選考',
  result_expected: '結果通知予定',
  event: '予定',
  task: 'タスク',
}

// 期限として扱う種類（過ぎても未完了なら「期限超過」）。予定・面接の日時は「結果未入力」として別に扱わない
const DUE_TYPES: CalendarItemType[] = ['es_deadline', 'test_deadline', 'deadline', 'task']

/** その項目の日（JST） */
export function entryDay(entry: CalendarEntry): DateOnly | null {
  if (entry.all_day_date) return entry.all_day_date
  if (entry.starts_at) return toJstDate(entry.starts_at)
  return null
}

/** 並べる順の基準。終日の項目はその日の終わり（同じ日の時刻ありの項目より後） */
function sortInstant(entry: CalendarEntry): number {
  if (entry.starts_at) return Date.parse(entry.starts_at)
  if (entry.all_day_date) return endOfJstDay(entry.all_day_date).getTime()
  return Number.POSITIVE_INFINITY
}

export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  return sortInstant(a) - sortInstant(b) || a.title.localeCompare(b.title, 'ja')
}

/** 日ごとにまとめる（各日の中は時刻順） */
export function groupByDay(entries: CalendarEntry[]): Map<DateOnly, CalendarEntry[]> {
  const map = new Map<DateOnly, CalendarEntry[]>()
  for (const entry of [...entries].sort(compareEntries)) {
    const day = entryDay(entry)
    if (!day) continue
    map.set(day, [...(map.get(day) ?? []), entry])
  }
  return map
}

/** from〜to（両端を含む、JST の暦日）の項目を時刻順に */
export function entriesBetween(entries: CalendarEntry[], from: DateOnly, to: DateOnly): CalendarEntry[] {
  return entries
    .filter((e) => {
      const day = entryDay(e)
      return day !== null && day >= from && day <= to
    })
    .sort(compareEntries)
}

export type AlertKind = 'overdue' | 'soon' | 'result_overdue'
export type CalendarAlert = {
  kind: AlertKind
  entry: CalendarEntry
  // overdue / result_overdue: 過ぎた日数（当日中に過ぎた時刻ありの期限は 0）。soon: 残りの日数（今日なら 0）
  days: number
  message: string
}

export const SOON_DAYS = 3

/**
 * アプリ内アラート（§3.7）。
 * - 期限超過: 締切・タスクの期日を過ぎて未完了
 * - 締切接近: 期日まで3日以内で未完了
 * - 結果待ち超過: 結果通知予定日を過ぎても結果待ち（自動で不合格にはしない、C-11）
 */
export function calendarAlerts(entries: CalendarEntry[], now: Date = new Date()): CalendarAlert[] {
  const today = todayJst(now)
  const alerts: CalendarAlert[] = []
  for (const entry of entries) {
    if (entry.done) continue
    const day = entryDay(entry)
    if (!day) continue
    if (entry.item_type === 'result_expected') {
      if (day < today) {
        const days = calendarDaysBetweenJst(day, today)
        alerts.push({ kind: 'result_overdue', entry, days, message: `結果通知予定日を${days}日過ぎています` })
      }
      continue
    }
    if (!DUE_TYPES.includes(entry.item_type)) continue
    const due = entry.starts_at ? Date.parse(entry.starts_at) : endOfJstDay(day).getTime()
    if (due < now.getTime()) {
      const days = Math.max(0, calendarDaysBetweenJst(day, today))
      alerts.push({
        kind: 'overdue',
        entry,
        days,
        message: days > 0 ? `${days}日超過` : '期限を過ぎました',
      })
    } else if (day <= addDaysToDate(today, SOON_DAYS)) {
      const days = calendarDaysBetweenJst(today, day)
      alerts.push({ kind: 'soon', entry, days, message: days === 0 ? '今日まで' : `あと${days}日` })
    }
  }
  const order: Record<AlertKind, number> = { overdue: 0, result_overdue: 1, soon: 2 }
  return alerts.sort((a, b) => order[a.kind] - order[b.kind] || compareEntries(a.entry, b.entry))
}

export type TaskLike = {
  id: string
  company_id: string | null
  title: string
  due_date: string | null
  due_at: string | null
  priority: number
  completed_at: string | null
}

/** タスクをカレンダーの項目の形にする（期日のないタスクも含める。タスクの一覧・ホーム用） */
export function taskEntry(task: TaskLike, companyName: string | null): CalendarEntry {
  return {
    source_table: 'tasks',
    source_id: task.id,
    company_id: task.company_id,
    company_name: companyName,
    item_type: 'task',
    title: task.title,
    starts_at: task.due_at,
    ends_at: null,
    all_day_date: task.due_date,
    done: task.completed_at !== null,
    priority: task.priority,
  }
}

/** 未完了のタスクの並び: 期日の近い順（期日なしは後ろ）、同じなら優先度の高い順 */
export function compareOpenTasks(a: CalendarEntry, b: CalendarEntry): number {
  return (
    sortInstant(a) - sortInstant(b) || (a.priority ?? 2) - (b.priority ?? 2) || a.title.localeCompare(b.title, 'ja')
  )
}
