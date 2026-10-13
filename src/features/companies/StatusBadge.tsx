import type { ApplicationStatus, SelectionStatus } from '@/lib/database.types'
import { companyBadge, type BadgeTone } from '@/lib/labels'

// 色の組み合わせはコントラスト検査（src/styles/contrast.test.ts）で確かめたものだけを使う
const TONES: Record<BadgeTone, string> = {
  gray: 'border border-line bg-cream text-muted',
  sage: 'bg-sage-100 text-sage-800',
  progress: 'border border-sage-700 bg-surface text-sage-700',
  success: 'bg-sage-700 text-surface',
  ended: 'border border-line bg-surface text-muted',
  warn: 'bg-warn-bg text-warn',
}

// 状態バッジ（1つだけ。設計書 02 §2.4）
export function StatusBadge({
  selectionStatus,
  applicationStatus,
}: {
  selectionStatus: SelectionStatus
  applicationStatus: ApplicationStatus
}) {
  const { label, tone } = companyBadge(selectionStatus, applicationStatus)
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {label}
    </span>
  )
}
