// 秘密情報の混入チェック（テスト 1-10）。CI と手元で実行する。
// 1) VITE_ で始まる環境変数名に秘密っぽい語が含まれていないか（VITE_ はブラウザに埋め込まれる）
// 2) ソースとビルド成果物に、秘密鍵・service_role キーらしき文字列がないか
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['src', 'public', 'index.html', 'vercel.json', '.env.example', 'dist']
const skipDirs = new Set(['node_modules', '.git'])
const problems = []

const forbiddenVite = /VITE_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)/g
const forbiddenValues = [
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  { name: 'service_role の文字列', re: /service_role/g },
  { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{10,}/g },
  { name: '秘密鍵', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
]

function walk(path) {
  if (!existsSync(path)) return
  const st = statSync(path)
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) if (!skipDirs.has(entry)) walk(join(path, entry))
    return
  }
  if (!/\.(ts|tsx|js|mjs|cjs|json|html|css|map|webmanifest|svg|example)$/.test(path) && !path.endsWith('.env.example')) return
  const text = readFileSync(path, 'utf8')
  for (const m of text.matchAll(forbiddenVite)) problems.push(`${path}: 秘密らしき名前の VITE_ 変数 ${m[0]}`)
  for (const { name, re } of forbiddenValues) {
    if (re.test(text)) problems.push(`${path}: ${name} が含まれています`)
    re.lastIndex = 0
  }
}

roots.forEach(walk)

if (problems.length > 0) {
  console.error('秘密情報の混入チェックに失敗しました:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log('秘密情報の混入チェック: 問題なし')
