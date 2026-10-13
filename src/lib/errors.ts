// DB関数が日本語で返すエラー（権限・入力・見つからない）は、そのまま画面に出してよい。
// それ以外（通信エラー、想定外のエラー）は、内部の情報を出さずに決まった文言にする。
const USER_FACING_CODES = new Set(['42501', '22023', 'P0002', '55000'])

export function userFacingMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, message } = error as { code: unknown; message: unknown }
    if (typeof code === 'string' && USER_FACING_CODES.has(code) && typeof message === 'string' && /[ぁ-んァ-ン一-龥]/.test(message)) {
      return message
    }
  }
  return fallback
}

// 権限エラー（招待が取り消された等）かどうか
export function isPermissionError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === '42501'
}
