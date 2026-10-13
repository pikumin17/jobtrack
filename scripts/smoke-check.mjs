// 公開後の自動チェック（読み取りのみ）。本番のデータ・設定は変更しない。
// 使うのはブラウザに公開されている値（アプリのURL、Supabase の URL と公開キー）だけ。
//
// 使い方:
//   APP_URL=https://xxxx.vercel.app \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx \
//   node scripts/smoke-check.mjs
//
// SUPABASE_* を省略すると、アプリ側のチェックだけを行う。

const appUrl = process.env.APP_URL?.replace(/\/$/, '')
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!appUrl) {
  console.error('APP_URL を指定してください')
  process.exit(2)
}
if (publishableKey && !publishableKey.startsWith('sb_publishable_')) {
  console.error('SUPABASE_PUBLISHABLE_KEY には公開キー（sb_publishable_ で始まるもの）だけを指定してください')
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

const secretPatterns = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['service_role', /service_role/],
  ['Google OAuth client secret', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['秘密鍵', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

// ---------------------------------------------------------------- アプリ（Vercel）
const top = await fetch(`${appUrl}/`, { redirect: 'manual' })
const html = await top.text()
check('トップページが表示される', top.status === 200 && html.includes('id="root"'), `HTTP ${top.status}`)

const deep = await fetch(`${appUrl}/companies`, { redirect: 'manual' })
check('画面のURLを直接開いても404にならない（SPAの書き換え）', deep.status === 200, `HTTP ${deep.status}`)

const csp = top.headers.get('content-security-policy') ?? ''
check('CSP が付いている', csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), csp || 'なし')
check('CSP が Supabase への接続を許可している', csp.includes('https://*.supabase.co'))
check('X-Frame-Options: DENY', top.headers.get('x-frame-options') === 'DENY')
check('X-Content-Type-Options: nosniff', top.headers.get('x-content-type-options') === 'nosniff')
check('HSTS が付いている', (top.headers.get('strict-transport-security') ?? '').includes('max-age='))

const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
check(
  'JavaScript のファイルが見つかる',
  assetPaths.some((p) => p.endsWith('.js')),
  `${assetPaths.length}件`,
)
const leaks = []
for (const path of assetPaths) {
  const body = await (await fetch(`${appUrl}${path}`)).text()
  for (const [name, re] of secretPatterns) if (re.test(body)) leaks.push(`${path}: ${name}`)
}
check('公開ファイルに秘密情報が含まれない', leaks.length === 0, leaks.join(', '))

// ---------------------------------------------------------------- Supabase（未ログインの状態）
if (supabaseUrl && publishableKey) {
  const headers = { apikey: publishableKey, 'Content-Type': 'application/json' }

  for (const table of ['profiles', 'allowed_emails', 'admin_audit_log', 'notification_settings', 'companies']) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers })
    const body = await res.text()
    // 権限エラー（401/403）か、0件なら合格。1件でも返れば不合格
    const leaked = res.ok && body.trim() !== '[]'
    check(`未ログインで ${table} を読めない`, !leaked, `HTTP ${res.status}`)
  }

  for (const [fn, payload] of [
    ['admin_list_members', {}],
    ['admin_invite', { p_email: 'smoke-check@example.invalid' }],
    ['hook_before_user_created', { event: { user: { email: 'smoke-check@example.invalid' } } }],
  ]) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    check(`未ログインで ${fn} を呼べない`, !res.ok, `HTTP ${res.status}`)
  }

  const settingsRes = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers })
  const settings = settingsRes.ok ? await settingsRes.json() : {}
  check('Googleログインが有効', settings?.external?.google === true)
  check('メール・パスワードでの登録が無効', settings?.external?.email === false)
}

// ---------------------------------------------------------------- 結果
let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'OK  ' : 'NG  '} ${r.name}${r.detail ? `（${r.detail}）` : ''}`)
}
console.log(`\n${results.length}件中 ${results.length - failed}件 合格`)
process.exit(failed === 0 ? 0 : 1)
