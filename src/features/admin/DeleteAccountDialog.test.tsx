import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { confirmationMatches } from './api'
import { DeleteAccountDialog } from './DeleteAccountDialog'

function setup(overrides: Partial<Parameters<typeof DeleteAccountDialog>[0]> = {}) {
  const props = {
    email: 't@example.com',
    pending: false,
    error: null,
    onConfirm: vi.fn(async () => ({ auth_user_deleted: true, auth_log_entries_deleted: 2 })),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<DeleteAccountDialog {...props} />)
  return { props, user: userEvent.setup() }
}

describe('confirmationMatches', () => {
  it('前後の空白と大文字小文字は区別しない', () => {
    expect(confirmationMatches('t@example.com', ' T@Example.com ')).toBe(true)
  })
  it('違うメール・空・似たメールは一致しない', () => {
    expect(confirmationMatches('t@example.com', 'xt@example.com')).toBe(false)
    expect(confirmationMatches('t@example.com', '')).toBe(false)
    expect(confirmationMatches('t@example.com', 't@example.co')).toBe(false)
  })
})

describe('DeleteAccountDialog', () => {
  it('1回目の確認で、対象メールと削除される内容・元に戻せないことを示す（件数や企業名は出さない）', () => {
    setup()
    expect(screen.getByRole('dialog')).toHaveTextContent('t@example.com')
    expect(screen.getByText('企業・応募・面接など、すべての就活データ')).toBeInTheDocument()
    expect(screen.getByText(/元に戻せません/)).toBeInTheDocument()
  })

  it('「やめる」で何もせずに閉じる', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: 'やめる' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('2回目の確認では、対象メールを正しく入力するまで削除ボタンが押せない', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: '次へ' }))
    const input = screen.getByLabelText('削除するアカウントのメールアドレス')
    const button = screen.getByRole('button', { name: '完全に削除する' })
    expect(button).toBeDisabled()
    await user.type(input, 'xt@example.com')
    expect(button).toBeDisabled()
    await user.clear(input)
    await user.type(input, 't@example.com')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(props.onConfirm).toHaveBeenCalledWith('t@example.com')
    expect(await screen.findByText('削除しました')).toBeInTheDocument()
  })

  it('貼り付けでは入力できない（手で入力させる）', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '次へ' }))
    const input = screen.getByLabelText('削除するアカウントのメールアドレス')
    await user.click(input)
    await user.paste('t@example.com')
    expect(input).toHaveValue('')
  })

  it('DB が拒否した理由（日本語）をそのまま表示する', async () => {
    const { user } = setup({ error: { code: '55000', message: '先に招待を取り消してください' } })
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(screen.getByText('先に招待を取り消してください')).toBeInTheDocument()
  })

  it('認証記録を削除できなかった場合は、完了画面でそのことを知らせる', async () => {
    const { user } = setup({ onConfirm: vi.fn(async () => ({ auth_user_deleted: true, auth_log_entries_deleted: null })) })
    await user.click(screen.getByRole('button', { name: '次へ' }))
    await user.type(screen.getByLabelText('削除するアカウントのメールアドレス'), 't@example.com')
    await user.click(screen.getByRole('button', { name: '完全に削除する' }))
    expect(await screen.findByText(/ログイン記録は、権限の都合で削除できませんでした/)).toBeInTheDocument()
  })
})
