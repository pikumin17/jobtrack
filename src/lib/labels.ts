// 画面に出す日本語の表示名（設計書 02 §3.4・§3.5）。DB の履歴の文言（private.*_label）と同じ言葉を使う。
import type {
  ApplicationStatus,
  ApplicationType,
  Channel,
  ClosedReason,
  FinalOutcome,
  SelectionStatus,
  StepKind,
  StepStatus,
} from './database.types'

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  main: '本選考',
  internship: 'インターン',
  early: '早期選考',
  other: 'その他',
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  company_site: '自社サイト',
  job_site: '就活サイト',
  reverse_offer: '逆求人',
  agent: 'エージェント',
  school: '学校・OB',
  other: 'その他',
}

// 志望度（確定）。null は「未設定」で、1 とは別扱い
export const PREFERENCE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: '第一志望',
  4: '本命候補',
  3: '興味あり',
  2: '情報収集中',
  1: '優先度低',
}

export function preferenceLabel(preference: number | null): string {
  if (preference === null) return '未設定'
  return `${preference} ${PREFERENCE_LABELS[preference as 1 | 2 | 3 | 4 | 5] ?? ''}`.trim()
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  not_applied: '未応募',
  applied: '応募済み',
}

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  not_started: '選考前',
  in_progress: '選考中',
  offer: '内定',
  offer_accepted: '内定承諾',
  offer_declined: '内定辞退',
  rejected: '不合格',
  withdrawn: '辞退',
  closed_other: '終了',
  needs_review: '要確認',
}

export const FINAL_OUTCOME_LABELS: Record<FinalOutcome, string> = {
  offer: '内定',
  offer_accepted: '内定承諾',
  offer_declined: '内定辞退',
  rejected: '不合格',
  withdrawn: '辞退',
  closed_other: '終了（その他）',
}

export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  rejected_document: '書類不合格',
  rejected_webtest: 'Webテスト不合格',
  rejected_interview: '面接不合格',
  withdrawn_other_offer: '辞退（他社内定）',
  withdrawn_lost_interest: '辞退（志望度低下）',
  withdrawn_schedule: '辞退（日程）',
  offer_declined: '内定辞退',
  other: 'その他',
}

export const STEP_KIND_LABELS: Record<StepKind, string> = {
  es: 'ES',
  webtest: 'Webテスト',
  aptitude: '適性検査',
  written_exam: '筆記試験',
  gd: 'GD',
  interview: '面接',
  casual: '面談',
  other: 'その他',
}

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  not_started: '未着手',
  scheduled: '対応予定',
  done: '実施/提出済み',
  awaiting_result: '結果待ち',
  passed: '通過',
  failed: '不合格',
  withdrawn: '辞退',
  exempted: '免除',
}

export type BadgeTone = 'gray' | 'sage' | 'progress' | 'success' | 'ended' | 'warn'

// 状態バッジは1つだけ（設計書 02 §2.4）。選考前のときだけ応募状態で「未応募／応募済み」を出し分ける
export function companyBadge(
  selectionStatus: SelectionStatus,
  applicationStatus: ApplicationStatus,
): { label: string; tone: BadgeTone } {
  if (selectionStatus === 'not_started') {
    return applicationStatus === 'applied' ? { label: '応募済み', tone: 'sage' } : { label: '未応募', tone: 'gray' }
  }
  const tone: BadgeTone =
    selectionStatus === 'in_progress'
      ? 'progress'
      : selectionStatus === 'offer' || selectionStatus === 'offer_accepted'
        ? 'success'
        : selectionStatus === 'needs_review'
          ? 'warn'
          : 'ended'
  return { label: SELECTION_STATUS_LABELS[selectionStatus], tone }
}
