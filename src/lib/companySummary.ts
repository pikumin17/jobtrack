// 結果待ち・次回予定・期限超過（設計書 02 §3.6）と、企業レベルの注意表示（§3.5.3 E-3, E-5, E-6）。
// 現在時刻に依存するため保存せず、画面表示のたびにここで求める。ホーム・一覧・詳細で共用する。
// 注意表示はデータを変えない（表示だけ）。
import type {
  ApplicationStatus,
  FinalOutcome,
  SelectionStatus,
  SelectionStatusReason,
  StepStatus,
} from './database.types'
import { calendarDaysBetweenJst, endOfJstDay, todayJst, toJstDate } from './dates'

export type SummaryStep = {
  id: string
  position: number
  label: string
  status: StepStatus
  deadline_date: string | null
  deadline_at: string | null
  scheduled_at: string | null
  scheduled_end_at: string | null
  completed_at: string | null
  result_expected_on: string | null
}

export type SummaryCompany = {
  selection_status: SelectionStatus
  selection_status_reason: SelectionStatusReason | null
  application_status: ApplicationStatus
  final_outcome: FinalOutcome | null
}

export type AwaitingResult = {
  stepId: string
  label: string
  // 完了日からの経過日数（JST の暦日）。完了日が未入力なら null
  elapsedDays: number | null
  resultExpectedOn: string | null
  // 結果通知予定日を過ぎた日数。予定日当日は 0（超過ではない）
  overdueDays: number
}

// 日時のある予定（フェーズ2はステップの締切と実施日時だけ。予定・タスクはフェーズ3で source を増やす、N-1）
export type ScheduleItem = {
  stepId: string
  source: 'deadline' | 'scheduled'
  label: string
  at: string
  // 終日の締切（時刻なし）
  allDay: boolean
}

export type OverdueItem = ScheduleItem & { overdueDays: number; message: string }

export type NoticeCode = 'all_passed' | 'not_applied_progress' | 'outcome_with_open_steps' | SelectionStatusReason
export type Notice = { code: NoticeCode; message: string }

export type CompanySummary = {
  awaiting: AwaitingResult[]
  next: ScheduleItem[]
  overdue: OverdueItem[]
  notices: Notice[]
}

// 選考が終わった企業（§3.5.4）。要確認は終了扱いにしない
export const ENDED_STATUSES: SelectionStatus[] = ['rejected', 'withdrawn', 'offer_declined', 'closed_other']
export const isEnded = (status: SelectionStatus) => ENDED_STATUSES.includes(status)

const OPEN_STEP: StepStatus[] = ['not_started', 'scheduled']
const OFFERS: FinalOutcome[] = ['offer', 'offer_accepted', 'offer_declined']

const NEEDS_REVIEW_MESSAGES: Record<SelectionStatusReason, string> = {
  failed_and_withdrawn: '不合格と辞退のステップが両方あります。どちらかを直すか、結果を記録してください',
  progress_after_failed: '不合格のステップの後ろで、選考が進んでいます。ステップを直すか、結果を記録してください',
  progress_after_withdrawn: '辞退したステップの後ろで、選考が進んでいます。ステップを直すか、結果を記録してください',
}

// ステップの締切・実施日時を、予定の項目にする（未着手・対応予定のステップだけ）
function scheduleItems(step: SummaryStep): ScheduleItem[] {
  if (!OPEN_STEP.includes(step.status)) return []
  const items: ScheduleItem[] = []
  if (step.deadline_at)
    items.push({ stepId: step.id, source: 'deadline', label: step.label, at: step.deadline_at, allDay: false })
  else if (step.deadline_date)
    items.push({ stepId: step.id, source: 'deadline', label: step.label, at: step.deadline_date, allDay: true })
  if (step.scheduled_at)
    items.push({ stepId: step.id, source: 'scheduled', label: step.label, at: step.scheduled_at, allDay: false })
  return items
}

// 期限の瞬間。終日の締切はその日の終わり（当日中は超過でない）。実施日時は終了日時があればその時刻
function dueInstant(item: ScheduleItem, step: SummaryStep): number {
  if (item.allDay) return endOfJstDay(item.at).getTime()
  if (item.source === 'scheduled' && step.scheduled_end_at) return Date.parse(step.scheduled_end_at)
  return Date.parse(item.at)
}

function sortKey(item: ScheduleItem): number {
  // 終日の締切は、その日の終わりとして並べる（同じ日の時刻ありの予定より後）
  return item.allDay ? endOfJstDay(item.at).getTime() : Date.parse(item.at)
}

export function summarizeCompany(
  company: SummaryCompany,
  steps: SummaryStep[],
  now: Date = new Date(),
): CompanySummary {
  const today = todayJst(now)
  const ordered = [...steps].sort((a, b) => a.position - b.position)

  const awaiting: AwaitingResult[] = ordered
    .filter((s) => s.status === 'awaiting_result')
    .map((s) => ({
      stepId: s.id,
      label: s.label,
      elapsedDays: s.completed_at ? calendarDaysBetweenJst(s.completed_at, now) : null,
      resultExpectedOn: s.result_expected_on,
      overdueDays: s.result_expected_on ? Math.max(0, calendarDaysBetweenJst(s.result_expected_on, today)) : 0,
    }))

  const next: ScheduleItem[] = []
  const overdue: OverdueItem[] = []
  // 終了済みの企業の未完了の締切・予定は、次回予定・期限超過に出さない（§3.5.4、E-8）
  if (!isEnded(company.selection_status)) {
    for (const step of ordered) {
      for (const item of scheduleItems(step)) {
        if (dueInstant(item, step) >= now.getTime()) {
          next.push(item)
          continue
        }
        const overdueDays = Math.max(0, calendarDaysBetweenJst(item.allDay ? item.at : toJstDate(item.at), today))
        const message =
          item.source === 'deadline'
            ? overdueDays > 0
              ? `${item.label}の締切を${overdueDays}日超過`
              : `${item.label}の締切を過ぎました`
            : `${item.label}の結果未入力`
        overdue.push({ ...item, overdueDays, message })
      }
    }
  }
  next.sort((a, b) => sortKey(a) - sortKey(b))
  overdue.sort((a, b) => sortKey(a) - sortKey(b))

  const notices: Notice[] = []
  if (company.selection_status === 'needs_review' && company.selection_status_reason) {
    notices.push({
      code: company.selection_status_reason,
      message: NEEDS_REVIEW_MESSAGES[company.selection_status_reason],
    })
  }
  // E-3: 全ステップが通過（免除を含む）で、結果が未記録。内定とは推測しない
  if (
    company.final_outcome === null &&
    ordered.length > 0 &&
    ordered.every((s) => s.status === 'passed' || s.status === 'exempted')
  ) {
    notices.push({
      code: 'all_passed',
      message: 'すべてのステップを通過しました。次のステップを追加するか、結果を記録してください',
    })
  }
  // E-5: 未応募なのに選考が進んでいる／結果が記録されている。応募状態は変えない
  if (company.application_status === 'not_applied' && company.selection_status !== 'not_started') {
    notices.push({ code: 'not_applied_progress', message: '選考が進んでいますが未応募です' })
  }
  // E-6: 内定系の結果を記録したが、未確定・不合格のステップが残っている（記録した結果を優先し、ステップは変えない）
  if (
    company.final_outcome !== null &&
    OFFERS.includes(company.final_outcome) &&
    ordered.some((s) => ['scheduled', 'done', 'awaiting_result', 'failed'].includes(s.status))
  ) {
    notices.push({ code: 'outcome_with_open_steps', message: '未確定・矛盾するステップがあります' })
  }

  return { awaiting, next, overdue, notices }
}
