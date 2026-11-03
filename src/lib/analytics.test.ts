import {
  closedReasons,
  formatRate,
  interviewStats,
  monthlyActivity,
  overview,
  passRates,
  preferenceCounts,
  progressByType,
  type AnalyticsCompany,
  type AnalyticsStep,
} from './analytics'

function company(id: string, overrides: Partial<AnalyticsCompany> = {}): AnalyticsCompany {
  return {
    id,
    application_type: null,
    preference: null,
    application_status: 'not_applied',
    applied_on: null,
    selection_status: 'not_started',
    closed_reason: null,
    created_at: '2026-10-01T03:00:00Z',
    ...overrides,
  }
}
const step = (
  company_id: string,
  kind: AnalyticsStep['kind'],
  status: AnalyticsStep['status'],
  completed_at: string | null = null,
) => ({
  company_id,
  kind,
  status,
  completed_at,
})

describe('分析の集計', () => {
  it('概要: 内定は内定・内定承諾、選考終了は不合格・辞退・内定辞退・その他', () => {
    const result = overview([
      company('a', { application_status: 'applied', applied_on: '2026-10-01', selection_status: 'in_progress' }),
      company('b', { selection_status: 'offer' }),
      company('c', { selection_status: 'offer_accepted' }),
      company('d', { selection_status: 'offer_declined' }),
      company('e', { selection_status: 'rejected' }),
      company('f', { selection_status: 'needs_review' }),
    ])
    expect(result).toEqual({ companies: 6, applied: 1, inProgress: 1, offers: 2, closed: 2, needsReview: 1 })
  })

  it('通過率の分母は通過＋不合格だけ。結果待ち・免除・辞退は入れない（B-4）', () => {
    const rates = passRates(
      [
        step('a', 'es', 'passed'),
        step('b', 'es', 'passed'),
        step('c', 'es', 'failed'),
        step('d', 'es', 'awaiting_result'),
        step('e', 'es', 'exempted'),
        step('f', 'es', 'withdrawn'),
        step('a', 'interview', 'awaiting_result'),
      ],
      ['es', 'webtest', 'interview'],
    )
    expect(rates).toEqual([
      { kind: 'es', passed: 2, failed: 1, rate: 2 / 3 },
      // 結果がまだ1件もない種別は、0% ではなく「データなし」
      { kind: 'interview', passed: 0, failed: 0, rate: null },
    ])
    expect(formatRate(rates[0]!.rate)).toBe('67%')
    expect(formatRate(rates[1]!.rate)).toBe('データなし')
    expect(formatRate(0)).toBe('0%')
  })

  it('志望度ごと（未設定は 1 と別に数える）', () => {
    const counts = preferenceCounts([company('a', { preference: 5 }), company('b', { preference: 1 }), company('c')])
    expect(counts).toEqual([
      { preference: 5, count: 1 },
      { preference: 4, count: 0 },
      { preference: 3, count: 0 },
      { preference: 2, count: 0 },
      { preference: 1, count: 1 },
      { preference: null, count: 1 },
    ])
  })

  it('応募区分ごとの進み具合（企業がない区分は出さない）', () => {
    const rows = progressByType([
      company('a', { application_type: 'internship', selection_status: 'in_progress' }),
      company('b', { application_type: 'internship', selection_status: 'rejected' }),
      company('c', { application_type: 'main', selection_status: 'offer' }),
    ])
    expect(rows.map((r) => [r.type, r.total, r.counts.in_progress, r.counts.closed, r.counts.offer])).toEqual([
      ['main', 1, 0, 0, 1],
      ['internship', 2, 1, 1, 0],
    ])
  })

  it('面接の回数は受けたものだけ（未着手・対応予定・辞退は数えない）', () => {
    expect(
      interviewStats([
        step('a', 'interview', 'passed'),
        step('a', 'interview', 'awaiting_result'),
        step('b', 'interview', 'failed'),
        step('c', 'interview', 'scheduled'),
        step('c', 'es', 'passed'),
      ]),
    ).toEqual({ interviews: 3, companies: 2 })
  })

  it('月別の活動は JST の月で数える', () => {
    const now = new Date('2026-11-03T03:00:00Z')
    const rows = monthlyActivity(
      [
        // UTC では 10/31 だが JST では 11/1
        company('a', { created_at: '2026-10-31T16:00:00Z', applied_on: '2026-11-02', application_status: 'applied' }),
        company('b', { created_at: '2026-10-15T03:00:00Z' }),
      ],
      [step('a', 'es', 'awaiting_result', '2026-11-02T01:00:00Z'), step('b', 'es', 'passed', '2026-09-30T01:00:00Z')],
      3,
      now,
    )
    expect(rows).toEqual([
      { month: '2026-09', registered: 0, applied: 0, completed: 1 },
      { month: '2026-10', registered: 1, applied: 0, completed: 0 },
      { month: '2026-11', registered: 1, applied: 1, completed: 1 },
    ])
  })

  it('選考終了の理由（多い順）と、理由が未記録の数', () => {
    expect(
      closedReasons([
        company('a', { selection_status: 'rejected', closed_reason: 'rejected_interview' }),
        company('b', { selection_status: 'rejected', closed_reason: 'rejected_interview' }),
        company('c', { selection_status: 'withdrawn', closed_reason: 'withdrawn_schedule' }),
        company('d', { selection_status: 'rejected' }),
        company('e', { selection_status: 'in_progress', closed_reason: 'other' }),
      ]),
    ).toEqual({
      reasons: [
        { reason: 'rejected_interview', count: 2 },
        { reason: 'withdrawn_schedule', count: 1 },
      ],
      unrecorded: 1,
    })
  })
})
