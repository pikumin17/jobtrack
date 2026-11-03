import { readFileSync } from 'node:fs'
import { generate, FIXTURE, OUTPUT } from '../../scripts/gen-selection-cases.mjs'
import type { FinalOutcome } from './database.types'
import { judgeSelectionStatus, type Judgement, type StepForJudge } from './status'

type Case = { name: string; final_outcome: FinalOutcome | null; steps: StepForJudge[]; expected: Judgement }
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: Case[] }

describe('選考状態の判定表（02 §3.5.3、DB と共通のテストケース）', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(judgeSelectionStatus(c.final_outcome, c.steps)).toEqual(c.expected)
  })

  it('DB 側のテスト（生成物）がテストケースと一致している（古ければ node scripts/gen-selection-cases.mjs を実行）', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(generate(fixture))
  })
})
