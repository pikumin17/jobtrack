import type { CompanySummary, ScheduleItem } from '@/lib/companySummary'
import type { CompanyListItem } from './api'
import { EMPTY_FILTERS, queryCompanies, type ListFilters, type ListRow, type SortKey } from './listQuery'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const emptySummary: CompanySummary = { awaiting: [], next: [], overdue: [], notices: [] }
const item = (at: string, allDay = false): ScheduleItem => ({ stepId: 'x', source: 'deadline', label: 'x', at, allDay })

function row(
  name: string,
  c: Partial<CompanyListItem> = {},
  s: Partial<CompanySummary> = {},
  warningCount = 0,
): ListRow {
  return {
    company: {
      id: name,
      name,
      preference: null,
      application_status: 'not_applied',
      applied_on: null,
      application_type: null,
      job_type: null,
      memo: null,
      selection_status: 'not_started',
      selection_status_reason: null,
      final_outcome: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      ...c,
    },
    summary: { ...emptySummary, ...s },
    warningCount,
  }
}

const names = (rows: ListRow[], f: Partial<ListFilters> = {}, sort: SortKey = 'updated') =>
  queryCompanies(rows, { ...EMPTY_FILTERS, ...f }, sort).map((r) => r.company.name)

describe('志望度（テスト 2-15）', () => {
  const rows = [row('未設定'), row('三', { preference: 3 }), row('五', { preference: 5 }), row('一', { preference: 1 })]
  it('並替で未設定は高い順・低い順とも末尾', () => {
    expect(names(rows, {}, 'preference_desc')).toEqual(['五', '三', '一', '未設定'])
    expect(names(rows, {}, 'preference_asc')).toEqual(['一', '三', '五', '未設定'])
  })
  it('絞込「未設定」は null の企業だけ（1 とは別）', () => {
    expect(names(rows, { preference: ['unset'] })).toEqual(['未設定'])
    expect(names(rows, { preference: [1] })).toEqual(['一'])
    expect(names(rows, { preference: [5, 'unset'] }).sort()).toEqual(['五', '未設定'].sort())
  })
})

describe('検索・絞込・並替（テスト 2-04）', () => {
  it('企業名・職種・メモを、全角半角や大文字小文字を区別せずに探す', () => {
    const rows = [
      row('ＡＢＣ商事'),
      row('X', { job_type: 'エンジニア' }),
      row('Y', { memo: '説明会でabcの話' }),
      row('Z'),
    ]
    expect(names(rows, { q: 'abc' }).sort()).toEqual(['Y', 'ＡＢＣ商事'].sort())
    expect(names(rows, { q: 'エンジニア' })).toEqual(['X'])
  })

  it('次の予定が近い順: 期限超過あり → 近い順 → 予定なし（締切なしの企業は末尾）', () => {
    const rows = [
      row('予定なし', { updated_at: '2026-10-13T00:00:00Z' }),
      row('遠い', {}, { next: [item('2026-10-30T00:00:00Z')] }),
      row('超過', {}, { overdue: [{ ...item('2026-10-01'), overdueDays: 3, message: '' }] }),
      row('近い終日', {}, { next: [item('2026-10-15', true)] }),
      row('近い', {}, { next: [item('2026-10-15T01:00:00Z')] }),
    ]
    expect(names(rows, {}, 'next')).toEqual(['超過', '近い', '近い終日', '遠い', '予定なし'])
  })

  it('応募日順は新しい順で、未応募は末尾', () => {
    const rows = [
      row('未応募'),
      row('古い', { application_status: 'applied', applied_on: '2026-09-01' }),
      row('新しい', { application_status: 'applied', applied_on: '2026-10-01' }),
    ]
    expect(names(rows, {}, 'applied_on')).toEqual(['新しい', '古い', '未応募'])
  })

  it('更新順・名前順', () => {
    const rows = [
      row('い', { updated_at: '2026-10-02T00:00:00Z' }),
      row('あ', { updated_at: '2026-10-01T00:00:00Z' }),
      row('う', { updated_at: '2026-10-03T00:00:00Z' }),
    ]
    expect(names(rows, {}, 'updated')).toEqual(['う', 'い', 'あ'])
    expect(names(rows, {}, 'name')).toEqual(['あ', 'い', 'う'])
  })

  it('応募状態・選考状態（複数）・応募区分（未設定を含む）・状況を組み合わせる', () => {
    const rows = [
      row(
        'A',
        {
          application_status: 'applied',
          applied_on: '2026-10-01',
          selection_status: 'in_progress',
          application_type: 'main',
        },
        { awaiting: [{ stepId: 's', label: '', elapsedDays: 1, resultExpectedOn: null, overdueDays: 0 }] },
      ),
      row('B', { application_status: 'applied', applied_on: '2026-10-01', selection_status: 'offer_declined' }),
      row('C', { selection_status: 'rejected', application_type: 'internship' }),
      row('D', { selection_status: 'needs_review' }, {}, 1),
    ]
    expect(names(rows, { application: ['applied'] }).sort()).toEqual(['A', 'B'])
    expect(names(rows, { selection: ['offer', 'ended'] }).sort()).toEqual(['B', 'C'])
    expect(names(rows, { applicationType: ['unset'] }).sort()).toEqual(['B', 'D'])
    expect(names(rows, { situation: ['awaiting'] })).toEqual(['A'])
    expect(names(rows, { situation: ['notice'] })).toEqual(['D'])
    expect(names(rows, { application: ['applied'], selection: ['in_progress'], applicationType: ['main'] })).toEqual([
      'A',
    ])
    expect(names(rows, { application: ['applied'], selection: ['ended'] })).toEqual([])
  })
})
