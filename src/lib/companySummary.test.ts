import { summarizeCompany, type SummaryCompany, type SummaryStep } from './companySummary'

// JST 2026-10-14(水) 12:00
const NOW = new Date('2026-10-14T03:00:00Z')

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
const company = (overrides: Partial<SummaryCompany> = {}): SummaryCompany => ({
  selection_status: 'in_progress',
  selection_status_reason: null,
  application_status: 'applied',
  final_outcome: null,
  ...overrides,
})

describe('結果待ち（テスト 2-03）', () => {
  it('結果待ちのステップを全件、経過日数つきで出す（JST の暦日）', () => {
    const s = summarizeCompany(
      company(),
      [
        // JST 10/13 23:30 に完了 → 10/14 時点で 1日経過
        step({ label: '一次面接', status: 'awaiting_result', completed_at: '2026-10-13T14:30:00Z' }),
        step({ label: 'Webテスト', status: 'awaiting_result' }),
      ],
      NOW,
    )
    expect(s.awaiting).toEqual([
      expect.objectContaining({ label: '一次面接', elapsedDays: 1, overdueDays: 0 }),
      expect.objectContaining({ label: 'Webテスト', elapsedDays: null }),
    ])
  })

  it('結果通知予定日の当日は超過ではなく、翌日から超過日数を数える', () => {
    const today = summarizeCompany(
      company(),
      [step({ status: 'awaiting_result', result_expected_on: '2026-10-14' })],
      NOW,
    )
    expect(today.awaiting[0]!.overdueDays).toBe(0)
    const past = summarizeCompany(
      company(),
      [step({ status: 'awaiting_result', result_expected_on: '2026-10-11' })],
      NOW,
    )
    expect(past.awaiting[0]!.overdueDays).toBe(3)
  })

  it('超過しても自動で不合格にしない（データは変えない、E-4）', () => {
    const steps = [step({ status: 'awaiting_result', result_expected_on: '2026-10-01' })]
    const copy = structuredClone(steps)
    summarizeCompany(company(), steps, NOW)
    expect(steps).toEqual(copy)
  })
})

describe('次回予定・期限超過（テスト 2-16）', () => {
  it('結果待ちと次回予定が同時にあれば両方を出す', () => {
    const s = summarizeCompany(
      company(),
      [
        step({ label: '一次面接', status: 'awaiting_result', completed_at: '2026-10-10T01:00:00Z' }),
        step({ label: '二次面接', status: 'scheduled', scheduled_at: '2026-10-16T05:00:00Z' }),
      ],
      NOW,
    )
    expect(s.awaiting).toHaveLength(1)
    expect(s.next.map((i) => i.label)).toEqual(['二次面接'])
  })

  it('締切と実施日時のうち近い順に並べる。終日の締切はその日の終わりとして扱う', () => {
    const s = summarizeCompany(
      company(),
      [
        step({ label: 'ES', deadline_date: '2026-10-15' }),
        step({ label: '説明', status: 'scheduled', scheduled_at: '2026-10-15T09:00:00Z' }), // JST 10/15 18:00
        step({ label: 'Web', deadline_at: '2026-10-14T14:59:00Z' }), // JST 10/14 23:59
      ],
      NOW,
    )
    expect(s.next.map((i) => i.label)).toEqual(['Web', '説明', 'ES'])
    expect(s.overdue).toEqual([])
  })

  it('終日の締切は当日中は超過でない（JST の境界）', () => {
    // JST 10/14 23:59:59 はまだ当日
    const s = summarizeCompany(company(), [step({ deadline_date: '2026-10-14' })], new Date('2026-10-14T14:59:59Z'))
    expect(s.next).toHaveLength(1)
    // JST 10/15 0:00 で超過
    const t = summarizeCompany(
      company(),
      [step({ label: 'ES', deadline_date: '2026-10-14' })],
      new Date('2026-10-14T15:00:00Z'),
    )
    expect(t.overdue).toEqual([expect.objectContaining({ message: 'ESの締切を1日超過', overdueDays: 1 })])
  })

  it('実施日時を過ぎた対応予定は「結果未入力」として超過に分ける', () => {
    const s = summarizeCompany(
      company(),
      [
        step({
          label: '一次面接',
          status: 'scheduled',
          scheduled_at: '2026-10-14T01:00:00Z',
          scheduled_end_at: '2026-10-14T02:00:00Z',
        }),
      ],
      NOW,
    )
    expect(s.next).toEqual([])
    expect(s.overdue.map((o) => o.message)).toEqual(['一次面接の結果未入力'])
  })

  it('実施中（終了日時の前）は超過にしない', () => {
    const s = summarizeCompany(
      company(),
      [step({ status: 'scheduled', scheduled_at: '2026-10-14T02:30:00Z', scheduled_end_at: '2026-10-14T03:30:00Z' })],
      NOW,
    )
    expect(s.overdue).toEqual([])
    expect(s.next).toHaveLength(1)
  })

  it('完了・確定したステップの日付は予定に出さない', () => {
    const s = summarizeCompany(
      company(),
      [
        step({ status: 'awaiting_result', deadline_date: '2026-10-20' }),
        step({ status: 'passed', scheduled_at: '2026-10-20T00:00:00Z' }),
      ],
      NOW,
    )
    expect(s.next).toEqual([])
  })

  it('終了済みの企業では、未完了の締切・予定を出さない（§3.5.4、E-8）', () => {
    for (const selection_status of ['rejected', 'withdrawn', 'offer_declined', 'closed_other'] as const) {
      const s = summarizeCompany(
        company({ selection_status }),
        [step({ deadline_date: '2026-10-20' }), step({ deadline_date: '2026-10-01' })],
        NOW,
      )
      expect(s.next).toEqual([])
      expect(s.overdue).toEqual([])
    }
    // 要確認は終了扱いにしない
    expect(
      summarizeCompany(company({ selection_status: 'needs_review' }), [step({ deadline_date: '2026-10-20' })], NOW)
        .next,
    ).toHaveLength(1)
  })
})

describe('注意表示（テスト 2-17）', () => {
  const codes = (c: SummaryCompany, steps: SummaryStep[]) => summarizeCompany(c, steps, NOW).notices.map((x) => x.code)

  it('E-5: 未応募でステップが進んでいる', () => {
    expect(codes(company({ application_status: 'not_applied' }), [step({ status: 'awaiting_result' })])).toEqual([
      'not_applied_progress',
    ])
    expect(codes(company({ application_status: 'not_applied', selection_status: 'not_started' }), [step({})])).toEqual(
      [],
    )
  })

  it('E-3: 全ステップ通過（免除を含む）で結果が未記録', () => {
    expect(codes(company(), [step({ status: 'passed' }), step({ status: 'exempted' })])).toEqual(['all_passed'])
    expect(codes(company({ final_outcome: 'offer', selection_status: 'offer' }), [step({ status: 'passed' })])).toEqual(
      [],
    )
    expect(codes(company(), [])).toEqual([])
  })

  it('E-6: 内定を記録したが結果待ち・不合格のステップが残っている', () => {
    expect(
      codes(company({ final_outcome: 'offer', selection_status: 'offer' }), [step({ status: 'awaiting_result' })]),
    ).toEqual(['outcome_with_open_steps'])
    expect(codes(company({ final_outcome: 'offer', selection_status: 'offer' }), [step({ status: 'failed' })])).toEqual(
      ['outcome_with_open_steps'],
    )
    expect(
      codes(company({ final_outcome: 'rejected', selection_status: 'rejected' }), [
        step({ status: 'awaiting_result' }),
      ]),
    ).toEqual([])
  })

  it('要確認の理由を注意として出す', () => {
    expect(
      codes(company({ selection_status: 'needs_review', selection_status_reason: 'progress_after_failed' }), []),
    ).toEqual(['progress_after_failed'])
  })

  it('注意表示はデータを変えない', () => {
    const c = company({ application_status: 'not_applied' })
    const steps = [step({ status: 'passed' })]
    const before = structuredClone({ c, steps })
    summarizeCompany(c, steps, NOW)
    expect({ c, steps }).toEqual(before)
  })
})
