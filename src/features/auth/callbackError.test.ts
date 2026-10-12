import { readError } from './callbackError'

describe('readError', () => {
  it('エラーがなければ null', () => {
    expect(readError({ search: '?code=abc', hash: '' })).toBeNull()
  })
  it('招待判定フックの拒否は not_invited', () => {
    const search = '?error=access_denied&error_description=' + encodeURIComponent('このアカウントは招待されていません')
    expect(readError({ search, hash: '' })).toBe('not_invited')
  })
  it('ハッシュ側のエラーも読む', () => {
    expect(readError({ search: '', hash: '#error=server_error&error_description=oops' })).toBe('other')
  })
})
