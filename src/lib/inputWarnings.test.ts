import type { SummaryStep } from './companySummary'
import { dismissWarning, inputWarnings, loadDismissed } from './inputWarnings'

const NOW = new Date('2026-10-14T03:00:00Z') // JST 10/14 12:00
let n = 0
function step(overrides: Partial<SummaryStep>): SummaryStep {
  n += 1
  return {
    id: `s${n}`,
    position: n,
    label: `ステップ${n}`,
    status: 'not_started',
    deadline_date: null,
    deadline_at: null,
    scheduled_at: null,
    scheduled_end_at: null,
    completed_at: null,
    result_expected_on: null,
    ...overrides,
  }
}
const applied = { application_status: 'applied' as const, applied_on: '2026-10-01' }
const codes = (steps: SummaryStep[], company = applied) => inputWarnings(company, steps, NOW).map((w) => w.code)

describe('入力警告（テスト 2-18）', () => {
  it('W-1: 結果待ち・実施済み・通過・不合格なのに完了日がない', () => {
    for (const status of ['awaiting_result', 'done', 'passed', 'failed'] as const)
      expect(codes([step({ status })])).toEqual(['W-1'])
    expect(codes([step({ status: 'withdrawn' })])).toEqual([])
    expect(codes([step({ status: 'exempted' })])).toEqual([])
  })

  it('W-2: 未着手・対応予定なのに完了日がある', () => {
    expect(codes([step({ status: 'scheduled', completed_at: '2026-10-05T00:00:00Z' })])).toEqual(['W-2'])
  })

  it('W-3: 結果通知予定日が完了日より前（JST の日付で比べる）', () => {
    expect(
      codes([
        step({ status: 'awaiting_result', completed_at: '2026-10-09T15:30:00Z', result_expected_on: '2026-10-09' }),
      ]),
    ).toEqual(['W-3'])
    expect(
      codes([
        step({ status: 'awaiting_result', completed_at: '2026-10-09T15:30:00Z', result_expected_on: '2026-10-10' }),
      ]),
    ).toEqual([])
  })

  it('W-4: 後ろのステップの日付が前のステップより早い', () => {
    const steps = [
      step({ status: 'passed', completed_at: '2026-10-08T00:00:00Z' }),
      step({ status: 'passed', completed_at: '2026-10-05T00:00:00Z' }),
    ]
    expect(inputWarnings(applied, steps, NOW)).toEqual([expect.objectContaining({ code: 'W-4', stepId: steps[1]!.id })])
    // 同じ日は警告しない
    expect(
      codes([
        step({ status: 'passed', completed_at: '2026-10-08T00:00:00Z' }),
        step({ status: 'passed', completed_at: '2026-10-08T05:00:00Z' }),
      ]),
    ).toEqual([])
  })

  it('W-5: 締切・実施日時を過ぎたのに未着手・対応予定のまま', () => {
    expect(codes([step({ deadline_date: '2026-10-13' })])).toEqual(['W-5'])
    expect(codes([step({ deadline_date: '2026-10-14' })])).toEqual([])
    expect(codes([step({ status: 'scheduled', scheduled_at: '2026-10-14T01:00:00Z' })])).toEqual(['W-5'])
  })

  it('W-6: 応募日が未来、または応募日より前に提出・実施済みのステップがある', () => {
    expect(codes([], { application_status: 'applied', applied_on: '2026-10-15' })).toEqual(['W-6'])
    expect(codes([step({ status: 'awaiting_result', completed_at: '2026-09-29T00:00:00Z' })])).toEqual(['W-6'])
    expect(codes([], { application_status: 'not_applied', applied_on: null } as never)).toEqual([])
  })

  it('警告はデータを変えない', () => {
    const steps = [step({ status: 'passed' })]
    const before = structuredClone(steps)
    inputWarnings(applied, steps, NOW)
    expect(steps).toEqual(before)
  })

  it('値を直すと fingerprint が変わり、「このまま」の記憶が効かなくなる', () => {
    const a = inputWarnings(applied, [step({ id: 'x', deadline_date: '2026-10-13' })], NOW)[0]!
    const b = inputWarnings(applied, [step({ id: 'x', deadline_date: '2026-10-12' })], NOW)[0]!
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })
})

describe('「このまま」の記憶', () => {
  beforeEach(() => localStorage.clear())
  it('端末に記憶し、読み出せる', () => {
    dismissWarning('a')
    expect(loadDismissed().has('a')).toBe(true)
  })
  it('壊れた値でも落ちない', () => {
    localStorage.setItem('jobtrack.dismissedWarnings', '{bad')
    expect(loadDismissed().size).toBe(0)
  })
})
