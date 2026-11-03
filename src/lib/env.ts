// ブラウザに埋め込まれる公開値のみ。秘密鍵をここに追加してはいけない（設計書 03 §5）。
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env.example を参照してください。`)
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: required('VITE_SUPABASE_PUBLISHABLE_KEY', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
}
