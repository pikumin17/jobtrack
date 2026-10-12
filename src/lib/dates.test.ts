import {
  calendarDaysBetweenJst,
  endOfJstDay,
  formatJstDate,
  formatJstDateTime,
  isDateOnly,
  startOfJstDay,
  toJstDate,
  todayJst,
} from './dates'

// 端末のタイムゾーンに関係なく JST で計算されることを確認する（テスト 1-09）。
// CI では TZ=UTC と TZ=America/Los_Angeles の両方で実行する。

describe('JST 境界', () => {
  it('UTC 14:59 は JST 23:59（同じ日）、15:00 は翌日 0:00', () => {
    expect(toJstDate('2026-10-12T14:59:59Z')).toBe('2026-10-12')
    expect(toJstDate('2026-10-12T15:00:00Z')).toBe('2026-10-13')
  })
  it('月末・年跨ぎ', () => {
    expect(toJstDate('2026-10-31T15:00:00Z')).toBe('2026-11-01')
    expect(toJstDate('2026-12-31T15:00:00Z')).toBe('2027-01-01')
    expect(toJstDate('2026-12-31T14:59:59Z')).toBe('2026-12-31')
  })
  it('todayJst は渡した瞬間の JST 日付', () => {
    expect(todayJst(new Date('2026-10-12T16:00:00Z'))).toBe('2026-10-13')
  })
  it('startOfJstDay / endOfJstDay', () => {
    expect(startOfJstDay('2026-10-12').toISOString()).toBe('2026-10-11T15:00:00.000Z')
    expect(endOfJstDay('2026-10-12').toISOString()).toBe('2026-10-12T14:59:59.999Z')
    expect(startOfJstDay('2027-01-01').toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })
})

describe('calendarDaysBetweenJst', () => {
  it('JST の暦日で数える', () => {
    // JST 10/12 23:59 → 10/13 0:00 は1日差
    expect(calendarDaysBetweenJst('2026-10-12T14:59:00Z', '2026-10-12T15:00:00Z')).toBe(1)
    expect(calendarDaysBetweenJst('2026-10-12', '2026-10-15')).toBe(3)
    expect(calendarDaysBetweenJst('2026-12-31', '2027-01-01')).toBe(1)
    expect(calendarDaysBetweenJst('2026-10-15', '2026-10-12')).toBe(-3)
  })
})

describe('表示', () => {
  it('曜日つき日付', () => {
    expect(formatJstDate('2026-10-12')).toBe('2026/10/12(月)')
    expect(formatJstDate('2026-10-18')).toBe('2026/10/18(日)')
    expect(formatJstDate('2026-10-12T15:30:00Z')).toBe('2026/10/13(火)')
  })
  it('日時', () => {
    expect(formatJstDateTime('2026-10-12T05:30:00Z')).toBe('2026/10/12(月) 14:30')
  })
})

describe('isDateOnly', () => {
  it('実在する日付だけ受け付ける', () => {
    expect(isDateOnly('2028-02-29')).toBe(true)
    expect(isDateOnly('2026-02-29')).toBe(false)
    expect(isDateOnly('2026-13-01')).toBe(false)
    expect(isDateOnly('2026/10/12')).toBe(false)
  })
  it('不正な日付は例外', () => {
    expect(() => startOfJstDay('2026-02-30')).toThrow()
  })
})
