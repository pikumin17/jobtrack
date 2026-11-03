import type { ListRow } from '@/features/companies/listQuery'
import { homeCounts } from './homeCounts'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const awaiting = { stepId: 's', label: '', elapsedDays: 1, resultExpectedOn: null, overdueDays: 0 }
const row = (c: Partial<ListRow['company']>, awaitingCount = 0): ListRow =>
  ({
    company: { application_status: 'not_applied', selection_status: 'not_started', ...c },
    summary: { awaiting: Array(awaitingCount).fill(awaiting), next: [], overdue: [], notices: [] },
    warningCount: 0,
  }) as ListRow

describe('ホームの数値', () => {
  it('登録・応募済み・選考中・結果待ち（ステップ数／企業数）・要確認を数える', () => {
    expect(
      homeCounts([
        row({ application_status: 'applied', selection_status: 'in_progress' }, 2),
        row({ application_status: 'applied', selection_status: 'in_progress' }, 1),
        row({ selection_status: 'needs_review' }),
        row({}),
      ]),
    ).toEqual({ companies: 4, applied: 2, inProgress: 2, awaitingSteps: 3, awaitingCompanies: 2, needsReview: 1 })
  })
})
