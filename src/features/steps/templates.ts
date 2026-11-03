import type { StepKind } from '@/lib/database.types'

export type StepTemplate = { kind: StepKind; label: string }

// 1件ずつ追加するときの候補（設計書 04 フェーズ2。説明会・インターンはフェーズ3の予定で扱う、B-5）
export const STEP_TEMPLATES: StepTemplate[] = [
  { kind: 'es', label: 'ES' },
  { kind: 'webtest', label: 'Webテスト' },
  { kind: 'aptitude', label: '適性検査' },
  { kind: 'written_exam', label: '筆記試験' },
  { kind: 'gd', label: 'GD' },
  { kind: 'interview', label: '一次面接' },
  { kind: 'interview', label: '二次面接' },
  { kind: 'interview', label: '最終面接' },
  { kind: 'casual', label: '面談' },
  { kind: 'other', label: 'その他' },
]

// よくある流れの一括追加（N-6）。追加した後で1件ずつ削除・並替できる
export const COMMON_FLOW: StepTemplate[] = [
  { kind: 'es', label: 'ES' },
  { kind: 'webtest', label: 'Webテスト' },
  { kind: 'interview', label: '一次面接' },
  { kind: 'interview', label: '二次面接' },
  { kind: 'interview', label: '最終面接' },
]
