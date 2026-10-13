import { z } from 'zod'
import type { Database, FinalOutcome, StepKind, StepStatus } from '@/lib/database.types'
import { fromJstDateTimeInput, isDateOnly, toJstDateTimeInput } from '@/lib/dates'
import { STEP_KIND_LABELS, STEP_STATUS_LABELS } from '@/lib/labels'
import type { SelectionStep } from '@/lib/database.types'

export const STEP_KINDS = Object.keys(STEP_KIND_LABELS) as StepKind[]
export const STEP_STATUSES = Object.keys(STEP_STATUS_LABELS) as StepStatus[]

export const stepLabelSchema = z
  .string()
  .trim()
  .min(1, '名前を入力してください')
  .max(50, '名前は50文字以内で入力してください')

// 入力欄の値（文字列）。日時は JST の 'YYYY-MM-DDTHH:mm'、日付は 'YYYY-MM-DD'、空欄は未入力
export type StepFormInput = {
  kind: StepKind
  label: string
  status: StepStatus
  deadline_mode: 'date' | 'datetime'
  deadline: string
  scheduled_at: string
  scheduled_end_at: string
  completed_at: string
  result_expected_on: string
  result_at: string
  place: string
  memo: string
}

export function stepFormInput(step: SelectionStep): StepFormInput {
  const dt = (v: string | null) => (v ? toJstDateTimeInput(v) : '')
  return {
    kind: step.kind,
    label: step.label,
    status: step.status,
    deadline_mode: step.deadline_at ? 'datetime' : 'date',
    deadline: step.deadline_at ? toJstDateTimeInput(step.deadline_at) : (step.deadline_date ?? ''),
    scheduled_at: dt(step.scheduled_at),
    scheduled_end_at: dt(step.scheduled_end_at),
    completed_at: dt(step.completed_at),
    result_expected_on: step.result_expected_on ?? '',
    result_at: dt(step.result_at),
    place: step.place ?? '',
    memo: step.memo ?? '',
  }
}

type StepUpdate = Database['public']['Tables']['selection_steps']['Update']
export type StepFormErrors = Partial<Record<keyof StepFormInput, string>>

// 入力欄の値を検査して保存用の値にする。入力エラー（保存不可、設計書 02 §3.5.5）があれば errors を返す
export function parseStepForm(input: StepFormInput): { values: StepUpdate } | { errors: StepFormErrors } {
  const errors: StepFormErrors = {}
  const label = stepLabelSchema.safeParse(input.label)
  if (!label.success) errors.label = label.error.issues[0]?.message
  if (!STEP_KINDS.includes(input.kind)) errors.kind = '種別を選んでください'
  if (!STEP_STATUSES.includes(input.status)) errors.status = '状態を選んでください'

  const dateTime = (key: keyof StepFormInput, value: string): string | null => {
    if (value === '') return null
    const iso = fromJstDateTimeInput(value)
    if (iso === null) errors[key] = '日時を正しく入力してください'
    return iso
  }
  const dateOnly = (key: keyof StepFormInput, value: string): string | null => {
    if (value === '') return null
    if (!isDateOnly(value)) {
      errors[key] = '日付を正しく入力してください'
      return null
    }
    return value
  }

  const deadlineAt = input.deadline_mode === 'datetime' ? dateTime('deadline', input.deadline) : null
  const deadlineDate = input.deadline_mode === 'date' ? dateOnly('deadline', input.deadline) : null
  const scheduledAt = dateTime('scheduled_at', input.scheduled_at)
  const scheduledEndAt = dateTime('scheduled_end_at', input.scheduled_end_at)
  if (scheduledEndAt && !scheduledAt) errors.scheduled_end_at = '終了日時の前に、実施日時を入力してください'
  else if (scheduledEndAt && scheduledAt && scheduledEndAt < scheduledAt)
    errors.scheduled_end_at = '終了日時は実施日時より後にしてください'
  const completedAt = dateTime('completed_at', input.completed_at)
  const resultExpectedOn = dateOnly('result_expected_on', input.result_expected_on)
  const resultAt = dateTime('result_at', input.result_at)
  const place = input.place.trim()
  if (place.length > 500) errors.place = '場所は500文字以内で入力してください'
  const memo = input.memo.trim()
  if (memo.length > 5000) errors.memo = 'メモは5000文字以内で入力してください'

  if (Object.keys(errors).length > 0) return { errors }
  return {
    values: {
      kind: input.kind,
      label: label.data!,
      status: input.status,
      deadline_date: deadlineDate,
      deadline_at: deadlineAt,
      scheduled_at: scheduledAt,
      scheduled_end_at: scheduledEndAt,
      completed_at: completedAt,
      result_expected_on: resultExpectedOn,
      result_at: resultAt,
      place: place === '' ? null : place,
      memo: memo === '' ? null : memo,
    },
  }
}

export type QuickAction = 'submitted' | 'passed' | 'failed' | 'withdrawn'

export const QUICK_ACTION_LABELS: Record<QuickAction, string> = {
  submitted: '提出した／受けた',
  passed: '通過',
  failed: '不合格',
  withdrawn: '辞退',
}

// ステップカードの簡単操作（設計書 02 §3.5.2、B-1）。「提出した／受けた」は結果待ちにして完了日時を記録する
export function quickActionUpdate(action: QuickAction, now: Date = new Date()): StepUpdate {
  const at = now.toISOString()
  switch (action) {
    case 'submitted':
      return { status: 'awaiting_result', completed_at: at }
    case 'passed':
      return { status: 'passed', result_at: at }
    case 'failed':
      return { status: 'failed', result_at: at }
    case 'withdrawn':
      return { status: 'withdrawn', result_at: at }
  }
}

// その状態のときに出す簡単操作。確定した状態（通過・不合格・辞退・免除）は詳細編集で直す
export function quickActionsFor(status: StepStatus): QuickAction[] {
  switch (status) {
    case 'not_started':
    case 'scheduled':
      return ['submitted', 'withdrawn']
    case 'done':
    case 'awaiting_result':
      return ['passed', 'failed', 'withdrawn']
    default:
      return []
  }
}

// 終了理由を選ぶのは、選考が終わった結果のときだけ（内定・内定承諾は終了ではない）
export const needsReason = (outcome: FinalOutcome | null) =>
  outcome !== null && outcome !== 'offer' && outcome !== 'offer_accepted'
