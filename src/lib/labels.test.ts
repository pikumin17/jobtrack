import { companyBadge, preferenceLabel } from './labels'

describe('状態バッジ（設計書 02 §2.4）', () => {
  it('選考前は応募状態で未応募／応募済みを出し分ける', () => {
    expect(companyBadge('not_started', 'not_applied').label).toBe('未応募')
    expect(companyBadge('not_started', 'applied').label).toBe('応募済み')
  })
  it('それ以外は選考状態の表示名（応募状態によらない）', () => {
    expect(companyBadge('in_progress', 'not_applied').label).toBe('選考中')
    expect(companyBadge('offer_accepted', 'applied')).toEqual({ label: '内定承諾', tone: 'success' })
    expect(companyBadge('closed_other', 'applied').label).toBe('終了')
    expect(companyBadge('needs_review', 'applied')).toEqual({ label: '要確認', tone: 'warn' })
  })
})

describe('志望度の表示名', () => {
  it('数値とラベル。未設定は 1 と区別する', () => {
    expect(preferenceLabel(4)).toBe('4 本命候補')
    expect(preferenceLabel(1)).toBe('1 優先度低')
    expect(preferenceLabel(null)).toBe('未設定')
  })
})
