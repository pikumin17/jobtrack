import type { ListRow } from '@/features/companies/listQuery'

export type HomeCounts = {
  companies: number
  applied: number
  inProgress: number
  awaitingSteps: number
  awaitingCompanies: number
  needsReview: number
}

// ホームの数値（設計書 02 §2.4、04 フェーズ2）。ゴミ箱内の企業は含めない
export function homeCounts(rows: ListRow[]): HomeCounts {
  return {
    companies: rows.length,
    applied: rows.filter((r) => r.company.application_status === 'applied').length,
    inProgress: rows.filter((r) => r.company.selection_status === 'in_progress').length,
    awaitingSteps: rows.reduce((n, r) => n + r.summary.awaiting.length, 0),
    awaitingCompanies: rows.filter((r) => r.summary.awaiting.length > 0).length,
    needsReview: rows.filter((r) => r.company.selection_status === 'needs_review').length,
  }
}
