// JSON バックアップの検証（設計書 02 §6、D-01〜D-05）。
// 復元の前にブラウザでここを通し、プレビューと警告を出す。最終的な検証と復元は DB（restore_my_data）がもう一度行う。
import { z } from 'zod'
import type { BackupCounts, BackupFile } from './database.types'

export const BACKUP_MAX_BYTES = 5 * 1024 * 1024

/** キーを並べ替えた JSON（チェックサムの計算用。キーの順番が変わっても同じ値になる） */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 中身（data）のチェックサム。ファイルの破損や手での書き換えを見つけるためのもの */
export async function backupChecksum(file: Pick<BackupFile, 'data'>): Promise<string> {
  return `sha256:${await sha256(canonicalJson(file.data))}`
}

const row = z.record(z.string(), z.unknown())
const rowWithId = row.and(z.object({ id: z.guid() }))

const backupSchema = z.object({
  format: z.literal('jobtrack-backup'),
  schema_version: z.literal(1),
  exported_at: z.string(),
  owner: z.object({ user_id: z.guid(), email: z.string() }),
  counts: z.record(z.string(), z.number()),
  data: z.object({
    profile: row.nullable(),
    notification_settings: row.nullable(),
    companies: z.array(rowWithId.and(z.object({ name: z.string() }))),
    selection_steps: z.array(rowWithId.and(z.object({ company_id: z.guid() }))),
    events: z.array(rowWithId.and(z.object({ company_id: z.guid().nullable().optional() }))),
    tasks: z.array(rowWithId.and(z.object({ company_id: z.guid().nullable().optional() }))),
    timeline_entries: z.array(row),
  }),
  checksum: z.string().optional(),
})

export type BackupCheck =
  | { ok: false; errors: string[] }
  | { ok: true; file: BackupFile; counts: BackupCounts; warnings: string[] }

/**
 * 復元の前の検証。errors があれば復元させない。warnings は確認画面に出して、利用者が判断する。
 * - 形式・版・中身の形（zod）、所有者（D-05）、チェックサム、参照の整合、ID の重複、同じ名前の企業
 */
export async function checkBackup(text: string, byteSize: number, currentUserId: string): Promise<BackupCheck> {
  if (byteSize > BACKUP_MAX_BYTES) return { ok: false, errors: ['ファイルが大きすぎます（5MBまで）'] }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['JSON として読めません。JobTrack で書き出したファイルを選んでください'] }
  }
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) {
    const top = json as { format?: unknown; schema_version?: unknown } | null
    if (!top || typeof top !== 'object' || top.format !== 'jobtrack-backup')
      return { ok: false, errors: ['JobTrack のバックアップではありません'] }
    if (top.schema_version !== 1) return { ok: false, errors: ['対応していない形式の版です'] }
    return { ok: false, errors: ['バックアップの中身の形が正しくありません（ファイルが壊れている可能性があります）'] }
  }
  const file = parsed.data as unknown as BackupFile
  const { data } = parsed.data
  const errors: string[] = []
  const warnings: string[] = []

  if (file.owner.user_id !== currentUserId)
    errors.push('ほかの利用者のバックアップです。自分で書き出したファイルだけを復元できます')

  if (file.checksum === undefined) warnings.push('チェックサムがありません。内容が書き換えられていないか確認できません')
  else if (file.checksum !== (await backupChecksum(file)))
    errors.push('チェックサムが一致しません。ファイルが壊れているか、書き換えられています')

  const companyIds = data.companies.map((c) => c.id)
  const allIds = [
    ...companyIds,
    ...data.selection_steps.map((s) => s.id),
    ...data.events.map((e) => e.id),
    ...data.tasks.map((t) => t.id),
  ]
  if (new Set(allIds).size !== allIds.length) errors.push('ID が重複している項目があります')
  const known = new Set(companyIds)
  const dangling =
    data.selection_steps.filter((s) => !known.has(s.company_id)).length +
    [...data.events, ...data.tasks].filter((x) => x.company_id && !known.has(x.company_id)).length
  if (dangling > 0) errors.push(`存在しない企業を参照している項目が${dangling}件あります`)

  const names = data.companies.map((c) => c.name.trim())
  const duplicated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (duplicated.length > 0) warnings.push(`同じ名前の企業があります: ${duplicated.join('、')}`)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    file,
    warnings,
    counts: {
      companies: data.companies.length,
      selection_steps: data.selection_steps.length,
      events: data.events.length,
      tasks: data.tasks.length,
      timeline_entries: data.timeline_entries.length,
    },
  }
}

/** ファイル名: jobtrack-backup-2026-11-03-2130.json（JST） */
export function backupFileName(stamp: string): string {
  return `jobtrack-backup-${stamp}.json`
}
