import { inviteSchema } from './api'

describe('inviteSchema', () => {
  it('メールを小文字にそろえる', () => {
    expect(inviteSchema.parse({ email: ' Foo@Example.COM ', note: '' }).email).toBe('foo@example.com')
  })
  it('形式が違うメールは拒否する', () => {
    expect(inviteSchema.safeParse({ email: 'not-an-email', note: '' }).success).toBe(false)
  })
})
