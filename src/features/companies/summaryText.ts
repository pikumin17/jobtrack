// 結果待ち・次回予定の表示用の文（一覧・詳細・ホームで共用）
import type { CompanySummary, ScheduleItem } from '@/lib/companySummary'
import { calendarDaysBetweenJst, formatJstShort } from '@/lib/dates'

export function scheduleText(item: ScheduleItem): string {
  const when = item.allDay ? formatJstShort(item.at) : formatJstShort(item.at, true)
  return item.source === 'deadline' ? `${item.label}の締切 ${when}` : `${item.label} ${when}`
}

export function daysLeftText(item: ScheduleItem, now: Date = new Date()): string {
  const days = calendarDaysBetweenJst(now, item.at)
  return days <= 0 ? '今日' : `あと${days}日`
}

export function awaitingText(a: CompanySummary['awaiting'][number]): string {
  const parts = [a.elapsedDays === null ? '完了日未入力' : `${a.elapsedDays}日経過`]
  if (a.resultExpectedOn) parts.push(`結果予定 ${formatJstShort(a.resultExpectedOn)}`)
  if (a.overdueDays > 0) parts.push(`${a.overdueDays}日超過`)
  return `${a.label}（${parts.join('・')}）`
}
