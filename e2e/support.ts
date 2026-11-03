// E2E の共通処理。ローカルの Supabase（127.0.0.1 / localhost）以外には接続しない。
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

function required(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`${name} がありません。CI のローカル Supabase（supabase status -o env）の値を設定してください`)
  return value
}

export function e2eEnv() {
  const apiUrl = required('E2E_API_URL')
  const dbUrl = required('E2E_DB_URL')
  // 本番などの外部の Supabase に向けて実行しないよう、接続先がこの機械の中であることを確かめる
  for (const url of [apiUrl, dbUrl]) {
    const host = new URL(url).hostname
    if (host !== '127.0.0.1' && host !== 'localhost')
      throw new Error(`E2E はローカルの Supabase だけで実行します: ${host}`)
  }
  return { apiUrl, dbUrl, anonKey: required('E2E_ANON_KEY'), serviceRoleKey: required('E2E_SERVICE_ROLE_KEY') }
}

export const PASSWORD = 'E2e-password-123!'
export const USERS = {
  a: { email: 'a-e2e@example.com', state: 'e2e/.auth/a.json' },
  b: { email: 'b-e2e@example.com', state: 'e2e/.auth/b.json' },
} as const

export function psql(sql: string): string {
  return execFileSync('psql', [e2eEnv().dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim()
}

async function auth(path: string, key: string, body: unknown) {
  const { apiUrl, anonKey } = e2eEnv()
  const res = await fetch(`${apiUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(json)}`)
  return json
}

// 招待（許可リスト）に入れてからユーザーを作る。招待判定フックは有効のまま
export async function createUser(email: string) {
  const { serviceRoleKey } = e2eEnv()
  psql(`insert into public.allowed_emails (email) values ('${email}') on conflict do nothing`)
  await auth('admin/users', serviceRoleKey, { email, password: PASSWORD, email_confirm: true })
}

// パスワードでログインしたセッションを、アプリ（supabase-js）が読む場所に置いた状態ファイルを作る。
// アプリ本体にはメールログインの画面もコードも追加しない（本番の認証は Google のみのまま）
export async function saveLoginState(email: string, file: string, origin: string) {
  const { apiUrl, anonKey } = e2eEnv()
  const session = await auth('token?grant_type=password', anonKey, { email, password: PASSWORD })
  // supabase-js の既定の保存キー: sb-<ホスト名の最初の部分>-auth-token
  const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify({
      cookies: [],
      origins: [{ origin, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }],
    }),
  )
}
