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

/** 表示用（短い形）: 10/15(水)。時刻があれば 10/15(水) 14:00 */
export function formatJstShort(value: Date | string, withTime = false): string {
  const instant = typeof value === 'string' && isDateOnly(value) ? startOfJstDay(value) : toInstant(value)
  const day = `${format(instant, 'M/d', { in: inTokyo })}(${WEEKDAYS_JA[Number(format(instant, 'i', { in: inTokyo })) % 7]})`
  return withTime ? `${day} ${format(instant, 'HH:mm', { in: inTokyo })}` : day
}

/** 入力欄（datetime-local）に入れる値: その瞬間の JST の 'YYYY-MM-DDTHH:mm' */
export function toJstDateTimeInput(value: Date | string): string {
  return format(toInstant(value), "yyyy-MM-dd'T'HH:mm", { in: inTokyo })
}

const DATE_TIME_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/

/** 入力欄（datetime-local）の値を JST の時刻として解釈し、保存用の ISO 文字列（UTC）にする。形式が違えば null */
export function fromJstDateTimeInput(value: string): string | null {
  const m = DATE_TIME_INPUT.exec(value)
  if (!m || !isDateOnly(m[1]!)) return null
  const hours = Number(m[2])
  const minutes = Number(m[3])
  if (hours > 23 || minutes > 59) return null
  return new Date(startOfJstDay(m[1]!).getTime() + (hours * 60 + minutes) * 60 * 1000).toISOString()
}

// ---------------------------------------------------------------- 暦日（'YYYY-MM-DD'）の計算（カレンダー用）
// 暦日は時刻を持たないので、UTC の 0:00 として足し引きする（端末のタイムゾーンに左右されない）

function dateOnlyToUtc(day: DateOnly): number {
  assertDateOnly(day)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

function utcToDateOnly(ms: number): DateOnly {
  return new Date(ms).toISOString().slice(0, 10)
}

/** 暦日に n 日足す（負なら引く） */
export function addDaysToDate(day: DateOnly, n: number): DateOnly {
  return utcToDateOnly(dateOnlyToUtc(day) + n * 24 * 60 * 60 * 1000)
}

/** 曜日（0=日 … 6=土） */
export function weekdayOf(day: DateOnly): number {
  return new Date(dateOnlyToUtc(day)).getUTCDay()
}

/** 'YYYY-MM'（月） */
export type MonthKey = string

export function monthOf(day: DateOnly): MonthKey {
  return day.slice(0, 7)
}

/** 月に n か月足す */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + n
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** 月の表示用: 2026年11月 */
export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${y}年${m}月`
}

/** 月の表（日曜始まりの週ごと）。前後の月の日も含めて 7 日 × 4〜6 週 */
export function monthWeeks(month: MonthKey): DateOnly[][] {
  const first = `${month}-01`
  const start = addDaysToDate(first, -weekdayOf(first))
  const nextFirst = `${addMonths(month, 1)}-01`
  const weeks: DateOnly[][] = []
  for (let day = start; day < nextFirst; ) {
    const week: DateOnly[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDaysToDate(day, 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** 時刻だけ（JST）: 14:30 */
export function formatJstTime(value: Date | string): string {
  return format(toInstant(value), 'HH:mm', { in: inTokyo })
}

// ISO 曜日（1=月 … 7=日）を % 7 して引く
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

function assertDateOnly(day: string): asserts day is DateOnly {
  if (!isDateOnly(day)) throw new Error(`日付の形式が正しくありません: ${day}`)
}
