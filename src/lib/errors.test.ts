import { isPermissionError, userFacingMessage } from './errors'

describe('userFacingMessage', () => {
  it('DB関数の日本語メッセージはそのまま出す', () => {
    expect(userFacingMessage({ code: 'P0002', message: '有効な招待が見つかりません' }, '失敗')).toBe(
      '有効な招待が見つかりません',
    )
  })
  it('英語の内部メッセージや通信エラーは決まった文言にする', () => {
    expect(userFacingMessage({ code: '42501', message: 'permission denied for table companies' }, '失敗')).toBe('失敗')
    expect(userFacingMessage(new TypeError('Failed to fetch'), '失敗')).toBe('失敗')
    expect(userFacingMessage(null, '失敗')).toBe('失敗')
  })
})

describe('isPermissionError', () => {
  it('42501 だけを権限エラーとみなす', () => {
    expect(isPermissionError({ code: '42501' })).toBe(true)
    expect(isPermissionError({ code: '23514' })).toBe(false)
    expect(isPermissionError(undefined)).toBe(false)
  })
})
