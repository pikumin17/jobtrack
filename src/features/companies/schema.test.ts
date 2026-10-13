import { applicationUpdate, companyFormSchema, isSafeHttpUrl, preferenceSchema } from './schema'

const empty = {
  name: 'サンプル',
  application_type: '',
  job_type: '',
  location: '',
  channel: '',
  recruit_url: '',
  mypage_url: '',
  login_id_hint: '',
  contact_person: '',
  memo: '',
}

describe('URL の検証（テスト 2-07）', () => {
  it('http(s) の URL だけを受け付ける', () => {
    expect(isSafeHttpUrl('https://example.com/recruit')).toBe(true)
    expect(isSafeHttpUrl('HTTP://example.com')).toBe(true)
    for (const bad of [
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      '//example.com',
      'example.com',
      'https://',
    ]) {
      expect(isSafeHttpUrl(bad)).toBe(false)
    }
  })

  it('javascript: を入れたフォームは保存できない', () => {
    const result = companyFormSchema.safeParse({ ...empty, recruit_url: 'javascript:alert(1)' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['recruit_url'])
    expect(companyFormSchema.safeParse({ ...empty, mypage_url: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('2049文字以上の URL は拒否する', () => {
    const long = 'https://example.com/' + 'a'.repeat(2049 - 20)
    expect(long).toHaveLength(2049)
    expect(companyFormSchema.safeParse({ ...empty, recruit_url: long }).success).toBe(false)
  })
})

describe('企業の基本情報フォーム', () => {
  it('空欄は null にし、前後の空白を除く', () => {
    expect(
      companyFormSchema.parse({
        ...empty,
        name: '  サンプル ',
        job_type: ' 営業 ',
        recruit_url: ' https://a.example ',
      }),
    ).toEqual({
      name: 'サンプル',
      application_type: null,
      job_type: '営業',
      location: null,
      channel: null,
      recruit_url: 'https://a.example',
      mypage_url: null,
      login_id_hint: null,
      contact_person: null,
      memo: null,
    })
  })

  it('選択肢にない値と上限を超える文字数は拒否する（DB の CHECK と同じ）', () => {
    expect(companyFormSchema.safeParse({ ...empty, channel: 'sns' }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...empty, application_type: 'x' }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...empty, memo: 'あ'.repeat(5001) }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...empty, memo: 'あ'.repeat(5000) }).success).toBe(true)
    expect(companyFormSchema.safeParse({ ...empty, login_id_hint: 'a'.repeat(201) }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...empty, name: '' }).success).toBe(false)
  })
})

describe('志望度（テスト 2-15）', () => {
  it('1〜5 の整数と未設定（null）だけを受け付ける', () => {
    for (const ok of [null, 1, 2, 3, 4, 5]) expect(preferenceSchema.safeParse(ok).success).toBe(true)
    for (const bad of [0, 6, 1.5, -1, '3', undefined]) expect(preferenceSchema.safeParse(bad).success).toBe(false)
  })
})

describe('応募状態の更新内容（テスト 2-13）', () => {
  it('応募状態と応募日を必ず一緒に変える', () => {
    expect(applicationUpdate('2026-10-12')).toEqual({ application_status: 'applied', applied_on: '2026-10-12' })
    expect(applicationUpdate(null)).toEqual({ application_status: 'not_applied', applied_on: null })
  })
  it('正しくない日付では作らない', () => {
    expect(() => applicationUpdate('2026-02-30')).toThrow()
    expect(() => applicationUpdate('')).toThrow()
  })
})
