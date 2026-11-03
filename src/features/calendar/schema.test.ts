import { emptyEventForm, emptyTaskForm, parseEventForm, parseTaskForm } from './schema'

describe('予定の入力', () => {
  it('時刻ありの予定は JST として解釈して UTC で保存する', () => {
    const result = parseEventForm({
      ...emptyEventForm('2026-11-10'),
      title: '  会社説明会  ',
      starts_at: '2026-11-10T10:00',
      ends_at: '2026-11-10T11:30',
    })
    expect(result).toEqual({
      values: expect.objectContaining({
        title: '会社説明会',
        starts_at: '2026-11-10T01:00:00.000Z',
        ends_at: '2026-11-10T02:30:00.000Z',
        all_day_date: null,
        company_id: null,
        url: null,
        place: null,
        memo: null,
      }),
    })
  })
  it('終日の予定は日付だけを保存する', () => {
    const result = parseEventForm({ ...emptyEventForm('2026-11-10', 'c1'), title: 'インターン', all_day: true })
    expect(result).toEqual({
      values: expect.objectContaining({ all_day_date: '2026-11-10', starts_at: null, ends_at: null, company_id: 'c1' }),
    })
  })
  it('名前・日時・URL・終了日時の誤りを返す（保存しない）', () => {
    const result = parseEventForm({
      ...emptyEventForm('2026-11-10'),
      title: '  ',
      starts_at: '2026-11-10T10:00',
      ends_at: '2026-11-10T09:00',
      url: 'javascript:alert(1)',
    })
    expect(result).toEqual({
      errors: {
        title: '名前を入力してください',
        ends_at: '終了日時は開始日時より後にしてください',
        url: 'URLは http:// か https:// で始めてください',
      },
    })
    expect(parseEventForm({ ...emptyEventForm('2026-11-10'), title: 'a', starts_at: '' })).toEqual({
      errors: { starts_at: '開始日時を入力してください' },
    })
  })
})

describe('タスクの入力', () => {
  it('期日なし・日付だけ・時刻までの3通り', () => {
    expect(parseTaskForm({ ...emptyTaskForm(), title: 'ES下書き' })).toEqual({
      values: { title: 'ES下書き', company_id: null, due_date: null, due_at: null, priority: 2, memo: null },
    })
    expect(parseTaskForm({ ...emptyTaskForm('c1', '2026-11-05'), title: 'ES下書き', priority: 1 })).toEqual({
      values: { title: 'ES下書き', company_id: 'c1', due_date: '2026-11-05', due_at: null, priority: 1, memo: null },
    })
    expect(parseTaskForm({ ...emptyTaskForm(), title: '提出', due_mode: 'datetime', due: '2026-11-05T23:59' })).toEqual(
      {
        values: expect.objectContaining({ due_date: null, due_at: '2026-11-05T14:59:00.000Z' }),
      },
    )
  })
  it('期日を選んだのに空なら誤り', () => {
    expect(parseTaskForm({ ...emptyTaskForm(), title: '提出', due_mode: 'date', due: '' })).toEqual({
      errors: { due: '期日を入力してください' },
    })
  })
})
