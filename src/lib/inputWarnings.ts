// 入力警告（設計書 02 §3.5.5 W-1〜W-6。W-7 は予定・タスクができるフェーズ3）。
// 保存は止めず、該当箇所の横に表示するだけ。DB には保存せず、選考状態・応募状態・ステップも変えない。
import type { ApplicationStatus, StepStatus } from './database.types'
import { todayJst, toJstDate } from './dates'
import type { SummaryStep } from './companySummary'

export type WarningCode = 'W-1' | 'W-2' | 'W-3' | 'W-4' | 'W-5' | 'W-6'

export type InputWarning = {
  code: WarningCode
  // ステップの警告ならそのステップ。応募状態欄の警告（W-6）は null
  stepId: string | null
  message: string
  // 「このまま」の記憶に使う。関係する値が変わると変わるので、直したら再表示される
  fingerprint: string
}

export type WarningCompany = { application_status: ApplicationStatus; applied_on: string | null }

const NEEDS_COMPLETED: StepStatus[] = ['awaiting_result', 'done', 'passed', 'failed']
const OPEN: StepStatus[] = ['not_started', 'scheduled']

// ステップの代表の日付（JST）。完了日 → 実施日時 → 締切の順
function stepDate(s: SummaryStep): string | null {
  if (s.completed_at) return toJstDate(s.completed_at)
  if (s.scheduled_at) return toJstDate(s.scheduled_at)
  if (s.deadline_at) return toJstDate(s.deadline_at)
  return s.deadline_date
}

function isPastDue(s: SummaryStep, now: Date): boolean {
  const today = todayJst(now)
  if (s.deadline_at && Date.parse(s.deadline_at) < now.getTime()) return true
  if (s.deadline_date && s.deadline_date < today) return true
  const end = s.scheduled_end_at ?? s.scheduled_at
  return !!end && Date.parse(end) < now.getTime()
}

export function inputWarnings(company: WarningCompany, steps: SummaryStep[], now: Date = new Date()): InputWarning[] {
  const warnings: InputWarning[] = []
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  const add = (code: WarningCode, step: SummaryStep | null, message: string, ...values: unknown[]) =>
    warnings.push({ code, stepId: step?.id ?? null, message, fingerprint: JSON.stringify([code, step?.id, ...values]) })

  let latest: string | null = null
  for (const s of ordered) {
    if (NEEDS_COMPLETED.includes(s.status) && !s.completed_at) add('W-1', s, '完了日未入力', s.status)
    if (OPEN.includes(s.status) && s.completed_at)
      add('W-2', s, '未着手・対応予定なのに完了日が入っています', s.status, s.completed_at)
    if (s.result_expected_on && s.completed_at && s.result_expected_on < toJstDate(s.completed_at))
      add('W-3', s, '結果通知予定日が完了日より前です', s.result_expected_on, s.completed_at)
    const date = stepDate(s)
    if (date && latest && date < latest)
      add('W-4', s, '前のステップより日付が早くなっています。並び順か日付を確認してください', date, latest)
    if (date && (!latest || date > latest)) latest = date
    if (OPEN.includes(s.status) && isPastDue(s, now))
      add(
        'W-5',
        s,
        '期限を過ぎていますが「未着手／対応予定」のままです',
        s.status,
        s.deadline_date,
        s.deadline_at,
        s.scheduled_at,
      )
  }

  if (company.application_status === 'applied' && company.applied_on) {
    if (company.applied_on > todayJst(now)) add('W-6', null, '応募日が未来の日付です', company.applied_on)
    const before = ordered.some(
      (s) => s.completed_at && !OPEN.includes(s.status) && toJstDate(s.completed_at) < company.applied_on!,
    )
    if (before) add('W-6', null, '応募日より前に提出・実施済みのステップがあります', company.applied_on, 'before')
  }
  return warnings
}

// 「このまま」を選んだ警告の記憶（端末だけ。消えても再表示されるだけ。§3.5.5）
const STORAGE_KEY = 'jobtrack.dismissedWarnings'

export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissWarning(fingerprint: string): Set<string> {
  const next = loadDismissed()
  next.add(fingerprint)
  try {
    // 増え続けないよう、新しいものから500件だけ残す
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next].slice(-500)))
  } catch {
    // 保存できなくても表示が戻るだけ
  }
  return next
}
