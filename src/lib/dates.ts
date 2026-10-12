// 日付・時刻の変換はすべてこのファイルを経由する（設計書 02 §4）。
// 保存は UTC（timestamptz）または暦日（date, 'YYYY-MM-DD'）。表示と日数計算は常に Asia/Tokyo。
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { TZDate, tz } from '@date-fns/tz'

export const APP_TIME_ZONE = 'Asia/Tokyo'
const inTokyo = tz(APP_TIME_ZONE)

/** 'YYYY-MM-DD' 形式の暦日（JST） */
export type DateOnly = string

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnly(value: string): value is DateOnly {
  if (!DATE_ONLY.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

function toInstant(value: Date | string): Date {
  return typeof value === 'string' ? parseISO(value) : value
}

/** その瞬間が JST で何日か（'YYYY-MM-DD'） */
export function toJstDate(value: Date | string): DateOnly {
  return format(toInstant(value), 'yyyy-MM-dd', { in: inTokyo })
}

/** JST の今日 */
export function todayJst(now: Date = new Date()): DateOnly {
  return toJstDate(now)
}

/** JST のその日の 0:00 を表す瞬間 */
export function startOfJstDay(day: DateOnly): Date {
  assertDateOnly(day)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, APP_TIME_ZONE).getTime())
}

/** JST のその日の 23:59:59.999 を表す瞬間（終日の締切の期限） */
export function endOfJstDay(day: DateOnly): Date {
  return new Date(startOfJstDay(day).getTime() + 24 * 60 * 60 * 1000 - 1)
}

/** JST の暦日で数えた日数差（to - from）。例: 前日なら 1 */
export function calendarDaysBetweenJst(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' && isDateOnly(from) ? startOfJstDay(from) : toInstant(from)
  const b = typeof to === 'string' && isDateOnly(to) ? startOfJstDay(to) : toInstant(to)
  return differenceInCalendarDays(b, a, { in: inTokyo })
}

/** 表示用: 2026/10/12(月) */
export function formatJstDate(value: Date | string): string {
  const instant = typeof value === 'string' && isDateOnly(value) ? startOfJstDay(value) : toInstant(value)
  return `${format(instant, 'yyyy/MM/dd', { in: inTokyo })}(${WEEKDAYS_JA[Number(format(instant, 'i', { in: inTokyo })) % 7]})`
}

/** 表示用: 2026/10/12(月) 14:30 */
export function formatJstDateTime(value: Date | string): string {
  const instant = toInstant(value)
  return `${formatJstDate(instant)} ${format(instant, 'HH:mm', { in: inTokyo })}`
}

// ISO 曜日（1=月 … 7=日）を % 7 して引く
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

function assertDateOnly(day: string): asserts day is DateOnly {
  if (!isDateOnly(day)) throw new Error(`日付の形式が正しくありません: ${day}`)
}
