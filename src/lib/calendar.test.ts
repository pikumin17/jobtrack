import { calendarAlerts, compareOpenTasks, entriesBetween, groupByDay, taskEntry, type CalendarEntry } from './calendar'
import { addDaysToDate, addMonths, formatMonth, monthWeeks, weekdayOf } from './dates'

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    source_table: 'tasks',
    source_id: crypto.randomUUID(),
    company_id: null,
    company_name: null,
    item_type: 'task',
    title: '項目',
    starts_at: null,
    ends_at: null,
    all_day_date: null,
    done: false,
    priority: null,
    ...overrides,
  }
}

// 2026-11-03 12:00 JST
const NOW = new Date('2026-11-03T03:00:00Z')

describe('暦日の計算', () => {
  it('日を足し引きする（月・年をまたぐ）', () => {
    expect(addDaysToDate('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('曜日（0=日）', () => {
    expect(weekdayOf('2026-11-01')).toBe(0)
    expect(weekdayOf('2026-11-07')).toBe(6)
  })
  it('月を足し引きする', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(formatMonth('2026-11')).toBe('2026年11月')
  })
  it('月の表は日曜始まりで、前後の月の日を含む', () => {
    const weeks = monthWeeks('2026-11')
    expect(weeks[0]![0]).toBe('2026-11-01')
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-05')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    const feb = monthWeeks('2026-02')
    expect(feb[0]![0]).toBe('2026-02-01')
    expect(feb).toHaveLength(4)
  })
})

describe('日ごとにまとめる', () => {
  it('時刻ありの項目は JST の日に入り、同じ日の中では終日の項目が後になる', () => {
    const map = groupByDay([
      entry({ title: '終日', all_day_date: '2026-11-05' }),
      entry({ title: '朝', starts_at: '2026-11-05T00:30:00Z' }),
      // UTC では 11/4 だが JST では 11/5 の 8:00
      entry({ title: '早朝', starts_at: '2026-11-04T23:00:00Z' }),
      entry({ title: '期日なし' }),
    ])
    expect(map.get('2026-11-05')?.map((e) => e.title)).toEqual(['早朝', '朝', '終日'])
    expect(map.has('2026-11-04')).toBe(false)
  })
  it('期間で絞り込む（両端を含む）', () => {
    const list = entriesBetween(
      [
        entry({ title: '前', all_day_date: '2026-11-02' }),
        entry({ title: '初日', all_day_date: '2026-11-03' }),
        entry({ title: '最終日', all_day_date: '2026-11-09' }),
        entry({ title: '後', all_day_date: '2026-11-10' }),
      ],
      '2026-11-03',
      '2026-11-09',
    )
    expect(list.map((e) => e.title)).toEqual(['初日', '最終日'])
  })
})

describe('アプリ内アラート（§3.7）', () => {
  it('期日を過ぎた未完了の締切は期限超過。終日の締切は当日中は超過にしない', () => {
    const alerts = calendarAlerts(
      [
        entry({ title: '昨日まで', item_type: 'es_deadline', all_day_date: '2026-11-01' }),
        entry({ title: '今日まで', item_type: 'es_deadline', all_day_date: '2026-11-03' }),
        entry({ title: '今朝まで', item_type: 'task', starts_at: '2026-11-02T23:00:00Z' }),
      ],
      NOW,
    )
    expect(alerts.map((a) => [a.kind, a.entry.title, a.message])).toEqual([
      ['overdue', '昨日まで', '2日超過'],
      ['overdue', '今朝まで', '期限を過ぎました'],
      ['soon', '今日まで', '今日まで'],
    ])
  })
  it('3日以内は締切接近。4日後は出さない', () => {
    const alerts = calendarAlerts(
      [
        entry({ title: '3日後', item_type: 'test_deadline', all_day_date: '2026-11-06' }),
        entry({ title: '4日後', item_type: 'test_deadline', all_day_date: '2026-11-07' }),
      ],
      NOW,
    )
    expect(alerts.map((a) => [a.entry.title, a.message])).toEqual([['3日後', 'あと3日']])
  })
  it('完了済み・期日なし・予定や面接の日時はアラートにしない', () => {
    const alerts = calendarAlerts(
      [
        entry({ title: '完了', item_type: 'task', all_day_date: '2026-11-01', done: true }),
        entry({ title: '期日なし', item_type: 'task' }),
        entry({ title: '説明会', item_type: 'event', all_day_date: '2026-11-01' }),
        entry({ title: '面接', item_type: 'step_scheduled', starts_at: '2026-11-01T01:00:00Z' }),
      ],
      NOW,
    )
    expect(alerts).toEqual([])
  })
  it('結果通知予定日を過ぎた結果待ちは「結果待ち超過」。当日は出さない（自動で不合格にしない）', () => {
    const alerts = calendarAlerts(
      [
        entry({ title: '一次面接', item_type: 'result_expected', all_day_date: '2026-10-31' }),
        entry({ title: 'ES', item_type: 'result_expected', all_day_date: '2026-11-03' }),
      ],
      NOW,
    )
    expect(alerts.map((a) => [a.kind, a.entry.title, a.message])).toEqual([
      ['result_overdue', '一次面接', '結果通知予定日を3日過ぎています'],
    ])
  })
})

describe('タスクの並び', () => {
  it('期日の近い順、期日なしは後ろ、同じ期日なら優先度の高い順', () => {
    const t = (title: string, due_date: string | null, priority: number) =>
      taskEntry({ id: title, company_id: null, title, due_date, due_at: null, priority, completed_at: null }, null)
    const sorted = [
      t('なし高', null, 1),
      t('後', '2026-11-10', 3),
      t('先・低', '2026-11-05', 3),
      t('先・高', '2026-11-05', 1),
    ]
      .sort(compareOpenTasks)
      .map((e) => e.title)
    expect(sorted).toEqual(['先・高', '先・低', '後', 'なし高'])
  })
})
