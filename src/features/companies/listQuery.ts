// 企業一覧の検索・絞込・並替（設計書 02 §2.4）。純粋関数（テスト 2-04, 2-15）
import type { ApplicationStatus, ApplicationType, SelectionStatus } from '@/lib/database.types'
import type { CompanySummary, ScheduleItem } from '@/lib/companySummary'
import { endOfJstDay } from '@/lib/dates'
import type { CompanyListItem } from './api'

export type SelectionGroup = 'not_started' | 'in_progress' | 'offer' | 'ended' | 'needs_review'
export type PreferenceFilter = 1 | 2 | 3 | 4 | 5 | 'unset'
export type Situation = 'awaiting' | 'overdue' | 'notice'
export type SortKey = 'next' | 'preference_desc' | 'preference_asc' | 'applied_on' | 'updated' | 'name'

export type ListFilters = {
  q: string
  application: ApplicationStatus[]
  selection: SelectionGroup[]
  preference: PreferenceFilter[]
  situation: Situation[]
  applicationType: (ApplicationType | 'unset')[]
}

export const EMPTY_FILTERS: ListFilters = {
  q: '',
  application: [],
  selection: [],
  preference: [],
  situation: [],
  applicationType: [],
}

export const SELECTION_GROUP_LABELS: Record<SelectionGroup, string> = {
  not_started: '選考前',
  in_progress: '選考中',
  offer: '内定系',
  ended: '終了系',
  needs_review: '要確認',
}

export const SORT_LABELS: Record<SortKey, string> = {
  next: '次の予定が近い順',
  preference_desc: '志望度が高い順',
  preference_asc: '志望度が低い順',
  applied_on: '応募日順',
  updated: '更新順',
  name: '名前順',
}

// 内定辞退は「内定（終了扱い）」の区分なので内定系に入れる（02 §3.5.3）
export function selectionGroup(status: SelectionStatus): SelectionGroup {
  switch (status) {
    case 'not_started':
    case 'in_progress':
    case 'needs_review':
      return status
    case 'offer':
    case 'offer_accepted':
    case 'offer_declined':
      return 'offer'
    default:
      return 'ended'
  }
}

export type ListRow = { company: CompanyListItem; summary: CompanySummary; warningCount: number }

const normalize = (s: string) => s.normalize('NFKC').toLowerCase()

export function countFilters(f: ListFilters): number {
  return f.application.length + f.selection.length + f.preference.length + f.situation.length + f.applicationType.length
}

function matches(row: ListRow, f: ListFilters): boolean {
  const c = row.company
  const q = normalize(f.q.trim())
  if (q && ![c.name, c.job_type, c.memo].some((v) => v && normalize(v).includes(q))) return false
  if (f.application.length && !f.application.includes(c.application_status)) return false
  if (f.selection.length && !f.selection.includes(selectionGroup(c.selection_status))) return false
  if (f.preference.length && !f.preference.includes((c.preference ?? 'unset') as PreferenceFilter)) return false
  if (f.applicationType.length && !f.applicationType.includes(c.application_type ?? 'unset')) return false
  // 状況は「どれかに当てはまる」
  if (f.situation.length) {
    const has: Record<Situation, boolean> = {
      awaiting: row.summary.awaiting.length > 0,
      overdue: row.summary.overdue.length > 0,
      notice: row.summary.notices.length > 0 || row.warningCount > 0,
    }
    if (!f.situation.some((s) => has[s])) return false
  }
  return true
}

const time = (iso: string) => Date.parse(iso)

// 次の予定の比較用: 期限超過あり → 次回予定が近い順 → 予定なし（02 §3.6）
const itemTime = (item: ScheduleItem) => (item.allDay ? endOfJstDay(item.at).getTime() : time(item.at))

function nextRank(row: ListRow): [number, number] {
  const overdue = row.summary.overdue[0]
  if (overdue) return [0, itemTime(overdue)]
  const next = row.summary.next[0]
  if (next) return [1, itemTime(next)]
  return [2, 0]
}

function compare(a: ListRow, b: ListRow, sort: SortKey): number {
  const ca = a.company
  const cb = b.company
  switch (sort) {
    case 'next': {
      const [ra, ta] = nextRank(a)
      const [rb, tb] = nextRank(b)
      return ra - rb || ta - tb
    }
    // 志望度は未設定（null）をどちらの順でも末尾にする（変更3）
    case 'preference_desc':
    case 'preference_asc': {
      if (ca.preference === null || cb.preference === null) {
        return (ca.preference === null ? 1 : 0) - (cb.preference === null ? 1 : 0)
      }
      return sort === 'preference_desc' ? cb.preference - ca.preference : ca.preference - cb.preference
    }
    // 応募日の新しい順。未応募は末尾
    case 'applied_on': {
      if (ca.applied_on === null || cb.applied_on === null) {
        return (ca.applied_on === null ? 1 : 0) - (cb.applied_on === null ? 1 : 0)
      }
      return cb.applied_on.localeCompare(ca.applied_on)
    }
    case 'updated':
      return 0
    case 'name':
      return ca.name.localeCompare(cb.name, 'ja')
  }
}

export function queryCompanies(rows: ListRow[], filters: ListFilters, sort: SortKey): ListRow[] {
  return rows
    .filter((r) => matches(r, filters))
    .sort((a, b) => compare(a, b, sort) || time(b.company.updated_at) - time(a.company.updated_at))
}
