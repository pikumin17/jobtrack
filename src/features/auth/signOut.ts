import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ログアウト時は、画面に残ったデータとログイン情報をすべて消す（A-5）
export async function signOutAndClear(queryClient: QueryClient) {
  queryClient.clear()
  await supabase.auth.signOut({ scope: 'local' })
}
