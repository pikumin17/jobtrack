// 選考状態の判定表のテストケース（supabase/fixtures/selection-cases.json）から pgTAP のテストを生成する（2-02）。
// 使い方: node scripts/gen-selection-cases.mjs   （生成物が古いと src/lib/status.test.ts が失敗する）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// リポジトリの直下からの相対パス
export const FIXTURE = 'supabase/fixtures/selection-cases.json'
export const OUTPUT = 'supabase/tests/database/06_selection_cases.test.sql'

const quote = (s) => (s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`)

export function generate(fixture) {
  const lines = [
    '-- このファイルは scripts/gen-selection-cases.mjs が supabase/fixtures/selection-cases.json から生成する。手で編集しない。',
    '-- 判定表（02 §3.5.3）を DB の関数で検査し、src/lib/status.ts と同じ結果になることを保証する（2-01, 2-02）',
    'begin;',
    `select plan(${fixture.cases.length});`,
  ]
  for (const c of fixture.cases) {
    lines.push(
      `select is((select row(j.status, j.reason)::text from private.judge_selection_status(${quote(c.final_outcome)}, ${quote(JSON.stringify(c.steps))}::jsonb) j),`,
      `  row(${quote(c.expected.status)}::text, ${quote(c.expected.reason)}::text)::text, ${quote(c.name)});`,
    )
  }
  lines.push('select * from finish();', 'rollback;', '')
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  writeFileSync(root + OUTPUT, generate(JSON.parse(readFileSync(root + FIXTURE, 'utf8'))))
  console.log(`生成しました: ${OUTPUT}`)
}
