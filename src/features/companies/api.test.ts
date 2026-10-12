import { companyNameSchema } from './api'

describe('companyNameSchema', () => {
  it('前後の空白を除いて受け付ける', () => {
    expect(companyNameSchema.parse('  サンプル  ')).toBe('サンプル')
  })
  it('空文字と101文字以上は拒否する', () => {
    expect(companyNameSchema.safeParse('   ').success).toBe(false)
    expect(companyNameSchema.safeParse('あ'.repeat(101)).success).toBe(false)
    expect(companyNameSchema.safeParse('あ'.repeat(100)).success).toBe(true)
  })
})
