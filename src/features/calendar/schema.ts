// 予定・タスクの入力欄の検査（DB の CHECK と同じ上限）。日時は JST の入力として解釈し、UTC で保存する
import { z } from 'zod'
import type { Database, EventKind, JobEvent, Task } from '@/lib/database.types'
import { fromJstDateTimeInput, isDateOnly, toJstDateTimeInput } from '@/lib/dates'

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  briefing: '説明会',
  internship: 'インターン',
  ob_visit: 'OB・OG訪問',
  other: 'その他',
}
export const EVENT_KINDS = Object.keys(EVENT_KIND_LABELS) as EventKind[]

export const PRIORITY_LABELS: Record<1 | 2 | 3, string> = { 1: '高', 2: '中', 3: '低' }

const titleSchema = z.string().trim().min(1, '名前を入力してください').max(100, '名前は100文字以内で入力してください')

const urlSchema = z
  .string()
  .trim()
  .max(2000, 'URLが長すぎます')
  .refine((v) => /^https?:\/\//.test(v), 'URLは http:// か https:// で始めてください')

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .transform((v) => (v === '' ? null : v))

// ---------------------------------------------------------------- 予定
export type EventFormInput = {
  title: string
  kind: EventKind
  company_id: string
  all_day: boolean
  date: string
  starts_at: string
  ends_at: string
  place: string
  url: string
  memo: string
}
export type EventFormErrors = Partial<Record<keyof EventFormInput, string>>
type EventInsert = Database['public']['Tables']['events']['Insert']

export function emptyEventForm(day: string, companyId = ''): EventFormInput {
  return {
    title: '',
    kind: 'briefing',
    company_id: companyId,
    all_day: false,
    date: day,
    starts_at: `${day}T10:00`,
    ends_at: '',
    place: '',
    url: '',
    memo: '',
  }
}

export function eventFormInput(event: JobEvent): EventFormInput {
  return {
    title: event.title,
    kind: event.kind,
    company_id: event.company_id ?? '',
    all_day: event.all_day_date !== null,
    date: event.all_day_date ?? '',
    starts_at: event.starts_at ? toJstDateTimeInput(event.starts_at) : '',
    ends_at: event.ends_at ? toJstDateTimeInput(event.ends_at) : '',
    place: event.place ?? '',
    url: event.url ?? '',
    memo: event.memo ?? '',
  }
}

export function parseEventForm(input: EventFormInput): { values: EventInsert } | { errors: EventFormErrors } {
  const errors: EventFormErrors = {}
  const title = titleSchema.safeParse(input.title)
  if (!title.success) errors.title = title.error.issues[0]?.message
  if (!EVENT_KINDS.includes(input.kind)) errors.kind = '種別を選んでください'

  let starts_at: string | null = null
  let ends_at: string | null = null
  let all_day_date: string | null = null
  if (input.all_day) {
    if (!isDateOnly(input.date)) errors.date = '日付を入力してください'
    else all_day_date = input.date
  } else {
    starts_at = fromJstDateTimeInput(input.starts_at)
    if (!starts_at) errors.starts_at = '開始日時を入力してください'
    if (input.ends_at !== '') {
      ends_at = fromJstDateTimeInput(input.ends_at)
      if (!ends_at) errors.ends_at = '終了日時の形式が正しくありません'
      else if (starts_at && Date.parse(ends_at) < Date.parse(starts_at))
        errors.ends_at = '終了日時は開始日時より後にしてください'
    }
  }

  let url: string | null = null
  if (input.url.trim() !== '') {
    const parsed = urlSchema.safeParse(input.url)
    if (!parsed.success) errors.url = parsed.error.issues[0]?.message
    else url = parsed.data
  }
  const place = optionalText(500, '場所').safeParse(input.place)
  if (!place.success) errors.place = place.error.issues[0]?.message
  const memo = optionalText(5000, 'メモ').safeParse(input.memo)
  if (!memo.success) errors.memo = memo.error.issues[0]?.message

  if (Object.keys(errors).length > 0 || !title.success || !place.success || !memo.success) return { errors }
  return {
    values: {
      title: title.data,
      kind: input.kind,
      company_id: input.company_id === '' ? null : input.company_id,
      starts_at,
      ends_at,
      all_day_date,
      place: place.data,
      url,
      memo: memo.data,
    },
  }
}

// ---------------------------------------------------------------- タスク
export type TaskFormInput = {
  title: string
  company_id: string
  due_mode: 'none' | 'date' | 'datetime'
  due: string
  priority: 1 | 2 | 3
  memo: string
}
export type TaskFormErrors = Partial<Record<keyof TaskFormInput, string>>
type TaskInsert = Database['public']['Tables']['tasks']['Insert']

export function emptyTaskForm(companyId = '', day = ''): TaskFormInput {
  return { title: '', company_id: companyId, due_mode: day ? 'date' : 'none', due: day, priority: 2, memo: '' }
}

export function taskFormInput(task: Task): TaskFormInput {
  return {
    title: task.title,
    company_id: task.company_id ?? '',
    due_mode: task.due_at ? 'datetime' : task.due_date ? 'date' : 'none',
    due: task.due_at ? toJstDateTimeInput(task.due_at) : (task.due_date ?? ''),
    priority: (task.priority as 1 | 2 | 3) ?? 2,
    memo: task.memo ?? '',
  }
}

export function parseTaskForm(input: TaskFormInput): { values: TaskInsert } | { errors: TaskFormErrors } {
  const errors: TaskFormErrors = {}
  const title = titleSchema.safeParse(input.title)
  if (!title.success) errors.title = title.error.issues[0]?.message
  if (![1, 2, 3].includes(input.priority)) errors.priority = '優先度を選んでください'

  let due_date: string | null = null
  let due_at: string | null = null
  if (input.due_mode === 'date') {
    if (!isDateOnly(input.due)) errors.due = '期日を入力してください'
    else due_date = input.due
  } else if (input.due_mode === 'datetime') {
    due_at = fromJstDateTimeInput(input.due)
    if (!due_at) errors.due = '期日（日時）を入力してください'
  }
  const memo = optionalText(5000, 'メモ').safeParse(input.memo)
  if (!memo.success) errors.memo = memo.error.issues[0]?.message

  if (Object.keys(errors).length > 0 || !title.success || !memo.success) return { errors }
  return {
    values: {
      title: title.data,
      company_id: input.company_id === '' ? null : input.company_id,
      due_date,
      due_at,
      priority: input.priority,
      memo: memo.data,
    },
  }
}
