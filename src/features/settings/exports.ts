// 書き出し（CSV 2種類・JSON バックアップ）と復元の処理。画面から呼ぶ
import { backupChecksum, backupFileName } from '@/lib/backup'
import { downloadFile, toCsv } from '@/lib/csv'
import type { BackupCounts, BackupFile, Company, SelectionStep } from '@/lib/database.types'
import { fileStampJst, formatJstDateTime } from '@/lib/dates'
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_TYPE_LABELS,
  CHANNEL_LABELS,
  CLOSED_REASON_LABELS,
  FINAL_OUTCOME_LABELS,
  SELECTION_STATUS_LABELS,
  STEP_KIND_LABELS,
  STEP_STATUS_LABELS,
} from '@/lib/labels'
import { supabase } from '@/lib/supabase'

const dt = (v: string | null) => (v ? formatJstDateTime(v) : '')

export function companiesCsv(companies: Company[]): string {
  return toCsv(
    [
      '企業名',
      '応募区分',
      '志望度',
      '応募状態',
      '応募日',
      '選考状態',
      '記録した結果',
      '選考終了の理由',
      '職種',
      '勤務地',
      '応募経路',
      '採用ページ',
      'マイページ',
      'ログインIDのヒント',
      '担当者',
      'メモ',
      '登録日時',
      '更新日時',
    ],
    companies.map((c) => [
      c.name,
      c.application_type && APPLICATION_TYPE_LABELS[c.application_type],
      c.preference,
      APPLICATION_STATUS_LABELS[c.application_status],
      c.applied_on,
      SELECTION_STATUS_LABELS[c.selection_status],
      c.final_outcome && FINAL_OUTCOME_LABELS[c.final_outcome],
      c.closed_reason && CLOSED_REASON_LABELS[c.closed_reason],
      c.job_type,
      c.location,
      c.channel && CHANNEL_LABELS[c.channel],
      c.recruit_url,
      c.mypage_url,
      c.login_id_hint,
      c.contact_person,
      c.memo,
      dt(c.created_at),
      dt(c.updated_at),
    ]),
  )
}

export function stepsCsv(steps: SelectionStep[], companyNames: Map<string, string>): string {
  return toCsv(
    [
      '企業名',
      '順番',
      '種別',
      '名前',
      '状態',
      '締切',
      '実施日時',
      '終了日時',
      '完了日時',
      '結果通知予定日',
      '結果の日時',
      '場所',
      'メモ',
    ],
    steps.map((s) => [
      companyNames.get(s.company_id) ?? '',
      s.position + 1,
      STEP_KIND_LABELS[s.kind],
      s.label,
      STEP_STATUS_LABELS[s.status],
      s.deadline_at ? dt(s.deadline_at) : s.deadline_date,
      dt(s.scheduled_at),
      dt(s.scheduled_end_at),
      dt(s.completed_at),
      s.result_expected_on,
      dt(s.result_at),
      s.place,
      s.memo,
    ]),
  )
}

// CSV はゴミ箱の企業を含めない（一覧と同じ）
export async function downloadCsv(kind: 'companies' | 'steps'): Promise<void> {
  const companies = await supabase.from('companies').select('*').is('deleted_at', null).order('created_at')
  if (companies.error) throw companies.error
  const stamp = fileStampJst()
  if (kind === 'companies') {
    downloadFile(companiesCsv(companies.data), `jobtrack-companies-${stamp}.csv`, 'text/csv;charset=utf-8')
    return
  }
  const names = new Map(companies.data.map((c) => [c.id, c.name]))
  const steps = await supabase.from('selection_steps').select('*').order('company_id').order('position')
  if (steps.error) throw steps.error
  const own = steps.data.filter((s) => names.has(s.company_id))
  own.sort((a, b) => (names.get(a.company_id) ?? '').localeCompare(names.get(b.company_id) ?? '', 'ja'))
  downloadFile(stepsCsv(own, names), `jobtrack-steps-${stamp}.csv`, 'text/csv;charset=utf-8')
}

/** 全データを JSON で書き出してダウンロードさせる。チェックサムを付ける */
export async function downloadBackup(): Promise<BackupCounts> {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  const file: BackupFile = { ...data, checksum: await backupChecksum(data) }
  downloadFile(JSON.stringify(file, null, 2), backupFileName(fileStampJst()), 'application/json')
  return file.counts
}

/** 復元（DB が 1 トランザクションで行う。失敗したら今のデータはそのまま） */
export async function restoreBackup(file: BackupFile): Promise<BackupCounts> {
  const { data, error } = await supabase.rpc('restore_my_data', { p_payload: file })
  if (error) throw error
  return data
}

/** 今の件数（復元のプレビューで、消える件数を見せる） */
export async function currentCounts(): Promise<BackupCounts> {
  const count = async (table: 'companies' | 'selection_steps' | 'events' | 'tasks') => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) throw error
    return count ?? 0
  }
  const [companies, selection_steps, events, tasks] = await Promise.all([
    count('companies'),
    count('selection_steps'),
    count('events'),
    count('tasks'),
  ])
  return { companies, selection_steps, events, tasks }
}
