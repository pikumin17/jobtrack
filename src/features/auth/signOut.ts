import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ログアウト時は、画面に残ったデータとログイン情報をすべて消す（A-5）。
// 通信の失敗などで supabase-js が端末のログイン情報を消せなかった場合に備え、保存領域からも直接消す。
export async function signOutAndClear(queryClient: QueryClient) {
  queryClient.clear()
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } finally {
    removeStoredSessions()
    queryClient.clear()
  }
}

function removeStoredSessions() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      // ログイン情報と、利用者のデータに結び付く記憶（入力警告の「このまま」）を消す。表示の好みは残す
      if (/^sb-.+-auth-token/.test(key) || key === 'jobtrack.dismissedWarnings') window.localStorage.removeItem(key)
    }
  } catch {
    // 保存領域が使えない環境では、消すものもない
  }
}
