import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env } from './env'

// 公開キー（publishable）のみを使う。データの保護は DB 側の RLS が担う。
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
