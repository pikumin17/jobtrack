// 手書きの型定義（src/lib/database.types.ts）が、マイグレーションを適用した DB と一致しているかを調べる（設計書 04 フェーズ2、N-9）。
// CI の使い捨て DB にだけ接続する。本番には接続しない。
// 使い方: DATABASE_URL=postgresql://... node scripts/check-db-types.mjs
//   調べる内容: 利用者（authenticated）が読める public のテーブルの列の名前（Row）と、呼べる public の関数の名前（Functions）
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL を指定してください（CI のローカル DB だけ）')
  process.exit(2)
}

const query = `
  select json_build_object(
    'tables', (select json_object_agg(t.table_name, t.cols) from (
                 select c.table_name, json_agg(c.column_name::text order by c.column_name) as cols
                   from information_schema.columns c
                   join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
                  where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
                    -- 利用者が読めるテーブル・列だけ（許可リスト・監査ログは管理者RPC経由のみ）
                    and has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'select')
                  group by c.table_name) t),
    'functions', (select coalesce(json_agg(distinct p.proname::text), '[]') from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
                    and has_function_privilege('authenticated', p.oid, 'execute')))`
const db = JSON.parse(execFileSync('psql', [url, '-X', '-q', '-At', '-c', query], { encoding: 'utf8' }))

// 型定義ファイルから、Tables の各 Row の列名と Functions の名前を読み取る
const source = ts.createSourceFile(
  'database.types.ts',
  readFileSync(`${root}src/lib/database.types.ts`, 'utf8'),
  ts.ScriptTarget.Latest,
)
const propertyNames = (node) =>
  node.members.filter(ts.isPropertySignature).map((m) => ({ name: m.name.getText(source), type: m.type }))
let typed = null
source.forEachChild((node) => {
  if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') {
    const pub = propertyNames(node.type).find((p) => p.name === 'public').type
    const parts = Object.fromEntries(propertyNames(pub).map((p) => [p.name, p.type]))
    typed = {
      tables: Object.fromEntries(
        propertyNames(parts.Tables).map((t) => [
          t.name,
          propertyNames(propertyNames(t.type).find((p) => p.name === 'Row').type)
            .map((c) => c.name)
            .sort(),
        ]),
      ),
      functions: propertyNames(parts.Functions)
        .map((f) => f.name)
        .sort(),
    }
  }
})

const problems = []
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
for (const name of new Set([...Object.keys(db.tables), ...Object.keys(typed.tables)])) {
  const dbCols = db.tables[name]
  const typedCols = typed.tables[name]
  if (!dbCols) problems.push(`型定義にあるが DB にないテーブル: ${name}`)
  else if (!typedCols) problems.push(`DB にあるが型定義にないテーブル: ${name}`)
  else if (!sameList(dbCols, typedCols)) {
    const missing = dbCols.filter((c) => !typedCols.includes(c))
    const extra = typedCols.filter((c) => !dbCols.includes(c))
    problems.push(
      `${name} の列が一致しない（型定義に不足: ${missing.join(', ') || 'なし'} / 型定義だけにある: ${extra.join(', ') || 'なし'}）`,
    )
  }
}
// 利用者が呼べる関数のうち、画面から使うものは型定義に載せる。招待判定フックは Supabase Auth 専用なので除く
const callable = db.functions.filter((f) => f !== 'hook_before_user_created')
for (const f of callable) if (!typed.functions.includes(f)) problems.push(`DB にあるが型定義にない関数: ${f}`)
for (const f of typed.functions) if (!callable.includes(f)) problems.push(`型定義にあるが DB で呼べない関数: ${f}`)

if (problems.length > 0) {
  console.error('型定義と DB が一致しません:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`型定義と DB は一致しています（テーブル ${Object.keys(db.tables).length}、関数 ${callable.length}）`)
