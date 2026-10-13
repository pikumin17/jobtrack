import { z } from 'zod'
import type { ApplicationType, Channel, Database } from '@/lib/database.types'
import { isDateOnly } from '@/lib/dates'
import { APPLICATION_TYPE_LABELS, CHANNEL_LABELS } from '@/lib/labels'

// 画面の入力チェック。DB の CHECK 制約（20261012000001）と同じ上限にし、DB でも同じ理由で拒否される（設計書 02 §3.5.5 入力エラー）

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, '企業名を入力してください')
  .max(100, '企業名は100文字以内で入力してください')

// 空欄は null（未入力）として保存する
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .transform((v) => (v === '' ? null : v))

// http:// か https:// で始まり、URL として読めるものだけ（javascript: などは保存しない。テスト 2-07）
export function isSafeHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048, `${label}は2048文字以内で入力してください`)
    .refine((v) => v === '' || isSafeHttpUrl(v), `${label}は http:// か https:// で始まるURLを入力してください`)
    .transform((v) => (v === '' ? null : v))

const optionalEnum = <T extends string>(values: readonly T[]) =>
  z.union([z.literal(''), z.enum(values as [T, ...T[]])]).transform((v): T | null => (v === '' ? null : (v as T)))

export const APPLICATION_TYPES = Object.keys(APPLICATION_TYPE_LABELS) as ApplicationType[]
export const CHANNELS = Object.keys(CHANNEL_LABELS) as Channel[]

// 志望度は 1〜5 の整数か未設定（null）。0・6・小数は拒否（テスト 2-15）
export const preferenceSchema = z.union([
  z.null(),
  z.number().int('志望度は1〜5の整数です').min(1, '志望度は1〜5の整数です').max(5, '志望度は1〜5の整数です'),
])

// 企業の基本情報の編集フォーム。応募状態・志望度・結果は専用の操作で変える
export const companyFormSchema = z.object({
  name: companyNameSchema,
  application_type: optionalEnum(APPLICATION_TYPES),
  job_type: optionalText(100, '職種'),
  location: optionalText(100, '勤務地'),
  channel: optionalEnum(CHANNELS),
  recruit_url: optionalUrl('採用ページ'),
  mypage_url: optionalUrl('マイページ'),
  login_id_hint: optionalText(200, 'ログインIDのヒント'),
  contact_person: optionalText(100, '担当者'),
  memo: optionalText(5000, 'メモ'),
})

export type CompanyFormInput = z.input<typeof companyFormSchema>
export type CompanyFormValues = z.output<typeof companyFormSchema>

// 応募日は JST の日付（YYYY-MM-DD）。未来の日付は保存できる（入力警告 W-6 は表示だけ。設計書 02 §3.5.5）
export const appliedOnSchema = z.string().refine((v) => isDateOnly(v), '応募日を正しく入力してください')

type CompanyUpdate = Database['public']['Tables']['companies']['Update']

// 応募状態と応募日は必ず一緒に変える（DB の CHECK: 応募済み ⇔ 応募日あり）
export function applicationUpdate(appliedOn: string | null): CompanyUpdate {
  return appliedOn === null
    ? { application_status: 'not_applied', applied_on: null }
    : { application_status: 'applied', applied_on: appliedOnSchema.parse(appliedOn) }
}
