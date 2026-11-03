import { backupChecksum, canonicalJson, checkBackup } from './backup'
import { csvCell, toCsv } from './csv'
import type { BackupFile } from './database.types'

const ME = '11111111-1111-1111-1111-111111111111'
const C1 = 'aaaaaaaa-0000-0000-0000-000000000001'

async function sample(overrides: Partial<BackupFile['data']> = {}): Promise<BackupFile> {
  const file: BackupFile = {
    format: 'jobtrack-backup',
    schema_version: 1,
    exported_at: '2026-11-03T12:00:00+09:00',
    owner: { user_id: ME, email: 'a@example.com' },
    counts: { companies: 1, selection_steps: 1, events: 0, tasks: 1 },
    data: {
      profile: { display_name: 'ぴくみん', graduation_year: 2028, purpose: null },
      notification_settings: null,
      companies: [{ id: C1, name: 'A社' }],
      selection_steps: [{ id: 'aaaaaaaa-5555-0000-0000-000000000001', company_id: C1, label: 'ES' }],
      events: [],
      tasks: [{ id: 'aaaaaaaa-7777-0000-0000-000000000001', company_id: null, title: 'やること' }],
      timeline_entries: [],
      ...overrides,
    },
  }
  return { ...file, checksum: await backupChecksum(file) }
}

const check = (file: unknown) => {
  const text = JSON.stringify(file)
  return checkBackup(text, text.length, ME)
}

describe('CSV', () => {
  it('BOM と CRLF を付け、カンマ・引用符・改行を含むセルは囲む', () => {
    expect(toCsv(['名前', 'メモ'], [['A社', 'a,b "c"\n次の行']])).toBe('﻿名前,メモ\r\nA社,"a,b ""c""\n次の行"\r\n')
  })
  it("数式として動く先頭文字には ' を付ける（CSV インジェクション対策）", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+81')).toBe("'+81")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell(-1)).toBe('-1')
    expect(csvCell(null)).toBe('')
  })
})

describe('バックアップの検証', () => {
  it('キーの順番が違っても同じチェックサムになる', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }] })).toBe('{"a":[{"c":null,"d":2}],"b":1}')
  })
  it('自分のバックアップは通り、件数を返す', async () => {
    const result = await check(await sample())
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        warnings: [],
        counts: { companies: 1, selection_steps: 1, events: 0, tasks: 1, timeline_entries: 0 },
      }),
    )
  })
  it('JSON でない・JobTrack でない・版が違うものは拒否', async () => {
    expect(await checkBackup('{', 1, ME)).toEqual({ ok: false, errors: [expect.stringContaining('JSON')] })
    expect(await check({ format: 'other' })).toEqual({ ok: false, errors: ['JobTrack のバックアップではありません'] })
    expect(await check({ ...(await sample()), schema_version: 2 })).toEqual({
      ok: false,
      errors: ['対応していない形式の版です'],
    })
  })
  it('ほかの利用者のバックアップは拒否（D-05）', async () => {
    const file = await sample()
    const result = await check({ ...file, owner: { ...file.owner, user_id: '22222222-2222-2222-2222-222222222222' } })
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('ほかの利用者')] })
  })
  it('中身を書き換えるとチェックサムが合わず拒否', async () => {
    const file = await sample()
    file.data.companies[0]!.name = '書き換え'
    expect(await check(file)).toEqual({ ok: false, errors: [expect.stringContaining('チェックサム')] })
  })
  it('存在しない企業への参照・ID の重複は拒否、同じ名前の企業は警告', async () => {
    const dangling = await sample({
      selection_steps: [
        { id: 'aaaaaaaa-5555-0000-0000-000000000001', company_id: 'aaaaaaaa-0000-0000-0000-000000000009' },
      ],
    })
    expect(await check(dangling)).toEqual({ ok: false, errors: [expect.stringContaining('存在しない企業')] })
    const twins = await sample({
      companies: [
        { id: C1, name: 'A社' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'A社' },
      ],
    })
    expect(await check(twins)).toEqual(
      expect.objectContaining({ ok: true, warnings: [expect.stringContaining('A社')] }),
    )
  })
  it('5MB を超えるファイルは読まない', async () => {
    expect(await checkBackup('{}', 5 * 1024 * 1024 + 1, ME)).toEqual({
      ok: false,
      errors: [expect.stringContaining('5MB')],
    })
  })
})
