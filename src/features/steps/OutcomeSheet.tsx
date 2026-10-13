import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Sheet } from '@/components/ui/Sheet'
import type { ClosedReason, Company, FinalOutcome } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { CLOSED_REASON_LABELS, FINAL_OUTCOME_LABELS } from '@/lib/labels'
import { useRecordOutcome } from './api'
import { needsReason } from './schema'

const OUTCOMES = Object.keys(FINAL_OUTCOME_LABELS) as FinalOutcome[]
const REASONS = Object.keys(CLOSED_REASON_LABELS) as ClosedReason[]

// 「結果を記録」（設計書 02 §2.4）。記録した結果はステップより優先される。ステップは変えない
export function OutcomeSheet({ company, onClose }: { company: Company; onClose: () => void }) {
  const record = useRecordOutcome(company.id)
  const [outcome, setOutcome] = useState<FinalOutcome | null>(company.final_outcome)
  const [reason, setReason] = useState<ClosedReason | ''>(company.closed_reason ?? '')

  async function save(next: FinalOutcome | null) {
    try {
      await record.mutateAsync({ outcome: next, reason: needsReason(next) && reason !== '' ? reason : null })
      onClose()
    } catch {
      // record.error で表示
    }
  }

  return (
    <Sheet title="結果を記録" onClose={onClose} busy={record.isPending}>
      <div role="radiogroup" aria-label="結果" className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={outcome === o}
            onClick={() => {
              setOutcome(o)
              if (o === 'offer_declined' && reason === '') setReason('offer_declined')
            }}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm aria-checked:border-sage-700 aria-checked:bg-sage-100 aria-checked:font-semibold"
          >
            {FINAL_OUTCOME_LABELS[o]}
          </button>
        ))}
      </div>
      {needsReason(outcome) && (
        <div className="mt-4">
          <label htmlFor="closed-reason" className="text-sm font-semibold">
            終了理由（任意）
          </label>
          <select
            id="closed-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ClosedReason | '')}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base"
          >
            <option value="">未選択</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {CLOSED_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        記録した結果は、ステップの状態より優先して表示されます。ステップは変わりません。
      </p>
      {record.isError && (
        <div className="mt-3">
          <ErrorMessage message={userFacingMessage(record.error, '保存できませんでした。もう一度お試しください。')} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {company.final_outcome !== null && (
          <Button variant="ghost" onClick={() => void save(null)} disabled={record.isPending} className="mr-auto">
            記録を取り消す
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={record.isPending}>
          やめる
        </Button>
        <Button onClick={() => void save(outcome)} disabled={record.isPending || outcome === null}>
          {record.isPending ? '保存中…' : '記録する'}
        </Button>
      </div>
    </Sheet>
  )
}
