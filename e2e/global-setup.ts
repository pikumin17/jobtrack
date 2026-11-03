import type { FullConfig } from '@playwright/test'
import { createUser, psql, saveLoginState, USERS } from './support'

// テスト用ユーザー2人を、CI のローカル Supabase にその場で作る
export default async function globalSetup(config: FullConfig) {
  const origin = config.projects[0]!.use.baseURL!
  // 前回の実行の残り（ローカルで繰り返すとき）を消す。auth.users を消すとプロフィールと就活データも連動して消える
  psql(`delete from auth.users where email in ('${USERS.a.email}', '${USERS.b.email}')`)
  for (const user of Object.values(USERS)) {
    await createUser(user.email)
    // 初回設定は済ませた状態にする（初回設定そのものは onboarding.spec.ts で確かめる）
    psql(`update public.profiles set onboarding_completed_at = now() where email = '${user.email}'`)
    await saveLoginState(user.email, user.state, origin)
  }
}
