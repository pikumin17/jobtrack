import type { SelectionStep } from '@/lib/database.types'
import { moveStep } from './api'
import {
  needsReason,
  parseStepForm,
  quickActionsFor,
  quickActionUpdate,
  stepFormInput,
  type StepFormInput,
} from './schema'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const base: StepFormInput = {
  kind: 'interview',
  label: '一次面接',
  status: 'scheduled',
  deadline_mode: 'date',
  deadline: '',
  scheduled_at: '',
  scheduled_end_at: '',
  completed_at: '',
  result_expected_on: '',
  result_at: '',
  place: '',
  memo: '',
}

describe('ステップの入力', () => {
  it('JST の入力を UTC で保存し、空欄は null にする', () => {
    const r = parseStepForm({ ...base, scheduled_at: '2026-10-15T09:00', scheduled_end_at: '2026-10-15T10:00' })
    expect(r).toEqual({
      values: expect.objectContaining({
        scheduled_at: '2026-10-15T00:00:00.000Z',
        scheduled_end_at: '2026-10-15T01:00:00.000Z',
        deadline_date: null,
        deadline_at: null,
        place: null,
        memo: null,
      }),
    })
  })

  it('締切は日付だけか時刻ありのどちらか一方だけを送る', () => {
    const d = parseStepForm({ ...base, deadline_mode: 'date', deadline: '2026-10-20' })
    expect('values' in d && [d.values.deadline_date, d.values.deadline_at]).toEqual(['2026-10-20', null])
    const t = parseStepForm({ ...base, deadline_mode: 'datetime', deadline: '2026-10-20T23:59' })
    expect('values' in t && [t.values.deadline_date, t.values.deadline_at]).toEqual([null, '2026-10-20T14:59:00.000Z'])
  })

  it('終了日時が実施日時より前、実施日時なしの終了日時は入力エラー（保存しない）', () => {
    expect(parseStepForm({ ...base, scheduled_at: '2026-10-15T10:00', scheduled_end_at: '2026-10-15T09:00' })).toEqual({
      errors: { scheduled_end_at: '終了日時は実施日時より後にしてください' },
    })
    expect(parseStepForm({ ...base, scheduled_end_at: '2026-10-15T09:00' })).toEqual({
      errors: { scheduled_end_at: '終了日時の前に、実施日時を入力してください' },
    })
  })

  it('名前の空欄・51文字以上、正しくない日付は入力エラー', () => {
    expect('errors' in parseStepForm({ ...base, label: ' ' })).toBe(true)
    expect('errors' in parseStepForm({ ...base, label: 'あ'.repeat(51) })).toBe(true)
    expect(parseStepForm({ ...base, result_expected_on: '2026-02-30' })).toEqual({
      errors: { result_expected_on: '日付を正しく入力してください' },
    })
  })

  it('保存済みの値を JST の入力欄の値に戻す', () => {
    const step = {
      kind: 'es',
      label: 'ES',
      status: 'awaiting_result',
      deadline_date: null,
      deadline_at: '2026-10-20T14:59:00Z',
      scheduled_at: null,
      scheduled_end_at: null,
      completed_at: '2026-10-14T15:30:00Z',
      result_expected_on: '2026-10-25',
      result_at: null,
      place: null,
      memo: null,
    } as SelectionStep
    expect(stepFormInput(step)).toMatchObject({
      deadline_mode: 'datetime',
      deadline: '2026-10-20T23:59',
      completed_at: '2026-10-15T00:30',
      result_expected_on: '2026-10-25',
    })
  })
})

describe('簡単操作（B-1）', () => {
  const now = new Date('2026-10-14T05:00:00Z')
  it('「提出した／受けた」は結果待ちにして完了日時を記録する', () => {
    expect(quickActionUpdate('submitted', now)).toEqual({ status: 'awaiting_result', completed_at: now.toISOString() })
  })
  it('通過・不合格・辞退は結果の日時を記録する', () => {
    expect(quickActionUpdate('passed', now)).toEqual({ status: 'passed', result_at: now.toISOString() })
    expect(quickActionUpdate('failed', now)).toEqual({ status: 'failed', result_at: now.toISOString() })
    expect(quickActionUpdate('withdrawn', now)).toEqual({ status: 'withdrawn', result_at: now.toISOString() })
  })
  it('状態に応じた操作だけを出す', () => {
    expect(quickActionsFor('not_started')).toEqual(['submitted', 'withdrawn'])
    expect(quickActionsFor('awaiting_result')).toEqual(['passed', 'failed', 'withdrawn'])
    expect(quickActionsFor('done')).toEqual(['passed', 'failed', 'withdrawn'])
    for (const s of ['passed', 'failed', 'withdrawn', 'exempted'] as const) expect(quickActionsFor(s)).toEqual([])
  })
})

describe('並替', () => {
  it('隣と入れ替える。端からは動かさない', () => {
    expect(moveStep(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveStep(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveStep(['a', 'b', 'c'], 0, -1)).toBeNull()
    expect(moveStep(['a', 'b', 'c'], 2, 1)).toBeNull()
  })
})

describe('結果の終了理由', () => {
  it('内定・内定承諾には理由を付けない', () => {
    expect(needsReason('offer')).toBe(false)
    expect(needsReason('offer_accepted')).toBe(false)
    expect(needsReason('rejected')).toBe(true)
    expect(needsReason('offer_declined')).toBe(true)
    expect(needsReason(null)).toBe(false)
  })
})
