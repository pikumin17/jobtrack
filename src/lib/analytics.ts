// 分析の集計（設計書 02 D7、04 フェーズ4）。DB のビューを増やさず、読み込んだ行から純粋関数で求める。
// 通過率の分母は「通過＋不合格」だけ（結果待ち・未確定・免除・辞退は入れない、B-4）。分母が0のときは null（0% と区別する）
import type { ApplicationType, ClosedReason, SelectionStatus, StepKind, StepStatus } from './database.types'
import { addMonths, monthOf, toJstDate, todayJst, type MonthKey } from './dates'

export type AnalyticsCompany = {
  id: string
  application_type: ApplicationType | null
  preference: number | null
  application_status: 'not_applied' | 'applied'
  applied_on: string | null
  selection_status: SelectionStatus
  closed_reason: ClosedReason | null
  created_at: string
}

export type AnalyticsStep = {
  company_id: string
  kind: StepKind
  status: StepStatus
  completed_at: string | null
}

export const OFFER_STATUSES: SelectionStatus[] = ['offer', 'offer_accepted']
export const CLOSED_STATUSES: SelectionStatus[] = ['rejected', 'withdrawn', 'offer_declined', 'closed_other']

export type Overview = {
  companies: number
  applied: number
  inProgress: number
  offers: number
  closed: number
  needsReview: number
}

export function overview(companies: AnalyticsCompany[]): Overview {
  const count = (statuses: SelectionStatus[]) => companies.filter((c) => statuses.includes(c.selection_status)).length
  return {
    companies: companies.length,
    applied: companies.filter((c) => c.application_status === 'applied').length,
    inProgress: count(['in_progress']),
    offers: count(OFFER_STATUSES),
    closed: count(CLOSED_STATUSES),
    needsReview: count(['needs_review']),
  }
}

export type PassRate = { kind: StepKind; passed: number; failed: number; rate: number | null }

/** ステップの種別ごとの通過率。種別の並びは選考の順（ES → … → 面接） */
export function passRates(steps: AnalyticsStep[], order: StepKind[]): PassRate[] {
  return order
    .map((kind) => {
      const own = steps.filter((s) => s.kind === kind)
      const passed = own.filter((s) => s.status === 'passed').length
      const failed = own.filter((s) => s.status === 'failed').length
      return { kind, passed, failed, rate: passed + failed === 0 ? null : passed / (passed + failed) }
    })
    .filter((r) => steps.some((s) => s.kind === r.kind))
}

/** 志望度ごとの企業数（5 → 1、未設定） */
export function preferenceCounts(companies: AnalyticsCompany[]): { preference: number | null; count: number }[] {
  return [5, 4, 3, 2, 1, null].map((preference) => ({
    preference,
    count: companies.filter((c) => c.preference === preference).length,
  }))
}

export type ProgressGroup = 'not_started' | 'in_progress' | 'offer' | 'closed' | 'needs_review'
export function progressGroup(status: SelectionStatus): ProgressGroup {
  if (OFFER_STATUSES.includes(status)) return 'offer'
  if (CLOSED_STATUSES.includes(status)) return 'closed'
  if (status === 'in_progress' || status === 'needs_review' || status === 'not_started') return status
  return 'not_started'
}

/** 応募区分ごとの進み具合（区分なしは null） */
export function progressByType(
  companies: AnalyticsCompany[],
): { type: ApplicationType | null; total: number; counts: Record<ProgressGroup, number> }[] {
  const types: (ApplicationType | null)[] = ['main', 'internship', 'early', 'other', null]
  return types
    .map((type) => {
      const own = companies.filter((c) => c.application_type === type)
      const counts: Record<ProgressGroup, number> = {
        not_started: 0,
        in_progress: 0,
        offer: 0,
        closed: 0,
        needs_review: 0,
      }
      for (const c of own) counts[progressGroup(c.selection_status)] += 1
      return { type, total: own.length, counts }
    })
    .filter((row) => row.total > 0)
}

/** 面接の回数（受けた面接 = 実施済み・結果待ち・通過・不合格）と、受けた企業の数 */
export function interviewStats(steps: AnalyticsStep[]): { interviews: number; companies: number } {
  const taken = steps.filter(
    (s) => s.kind === 'interview' && ['done', 'awaiting_result', 'passed', 'failed'].includes(s.status),
  )
  return { interviews: taken.length, companies: new Set(taken.map((s) => s.company_id)).size }
}

export type MonthlyActivity = { month: MonthKey; registered: number; applied: number; completed: number }

/** 直近 n か月の活動（企業の登録・応募・ステップの実施/提出）。月は JST */
export function monthlyActivity(
  companies: AnalyticsCompany[],
  steps: AnalyticsStep[],
  months = 6,
  now: Date = new Date(),
): MonthlyActivity[] {
  const last = monthOf(todayJst(now))
  const keys = Array.from({ length: months }, (_, i) => addMonths(last, i - months + 1))
  return keys.map((month) => ({
    month,
    registered: companies.filter((c) => monthOf(toJstDate(c.created_at)) === month).length,
    applied: companies.filter((c) => c.applied_on !== null && monthOf(c.applied_on) === month).length,
    completed: steps.filter((s) => s.completed_at !== null && monthOf(toJstDate(s.completed_at)) === month).length,
  }))
}

/** 選考終了の理由の内訳（終了した企業のうち、理由を記録したもの。多い順） */
export function closedReasons(companies: AnalyticsCompany[]): {
  reasons: { reason: ClosedReason; count: number }[]
  unrecorded: number
} {
  const closed = companies.filter((c) => CLOSED_STATUSES.includes(c.selection_status))
  const map = new Map<ClosedReason, number>()
  for (const c of closed) if (c.closed_reason) map.set(c.closed_reason, (map.get(c.closed_reason) ?? 0) + 1)
  return {
    reasons: [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    unrecorded: closed.filter((c) => !c.closed_reason).length,
  }
}

/** 割合の表示。null は「データなし」（0% と混同しない） */
export function formatRate(rate: number | null): string {
  return rate === null ? 'データなし' : `${Math.round(rate * 100)}%`
}
