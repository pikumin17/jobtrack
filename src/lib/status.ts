// 企業全体の選考状態の判定表（設計書 02 §3.5.3）。DB の private.judge_selection_status と同じ規則。
// 画面の即時反映（楽観的更新）に使う。保存される値は常に DB が計算する（S-16）。
// 規則を変えるときは supabase/fixtures/selection-cases.json と DB の関数も同時に変えること（2-02）。
import type { FinalOutcome, SelectionStatus, SelectionStatusReason, StepStatus } from './database.types'

export type StepForJudge = { position: number; status: StepStatus }
export type Judgement = { status: SelectionStatus; reason: SelectionStatusReason | null }

const PROGRESSED: StepStatus[] = ['scheduled', 'done', 'awaiting_result', 'passed']

function firstPosition(steps: StepForJudge[], status: StepStatus): number | null {
  const positions = steps.filter((s) => s.status === status).map((s) => s.position)
  return positions.length === 0 ? null : Math.min(...positions)
}

function progressedAfter(steps: StepForJudge[], position: number): boolean {
  return steps.some((s) => s.position > position && PROGRESSED.includes(s.status))
}

export function judgeSelectionStatus(finalOutcome: FinalOutcome | null, steps: StepForJudge[]): Judgement {
  if (finalOutcome !== null) return { status: finalOutcome, reason: null }

  const failed = firstPosition(steps, 'failed')
  const withdrawn = firstPosition(steps, 'withdrawn')
  if (failed !== null && withdrawn !== null) return { status: 'needs_review', reason: 'failed_and_withdrawn' }
  if (failed !== null) {
    return progressedAfter(steps, failed)
      ? { status: 'needs_review', reason: 'progress_after_failed' }
      : { status: 'rejected', reason: null }
  }
  if (withdrawn !== null) {
    return progressedAfter(steps, withdrawn)
      ? { status: 'needs_review', reason: 'progress_after_withdrawn' }
      : { status: 'withdrawn', reason: null }
  }
  if (steps.some((s) => [...PROGRESSED, 'exempted'].includes(s.status))) return { status: 'in_progress', reason: null }
  return { status: 'not_started', reason: null }
}
