import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Sheet } from '@/components/ui/Sheet'
import type { SelectionStep, StepStatus } from '@/lib/database.types'
import { formatJstShort } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { STEP_STATUS_LABELS } from '@/lib/labels'
import { AddStepSheet } from './AddStepSheet'
import { moveStep, useDeleteStep, useReorderSteps, useUpdateStep } from './api'
import { QUICK_ACTION_LABELS, quickActionsFor, quickActionUpdate } from './schema'
import { StepEditSheet } from './StepEditSheet'

type Props = { companyId: string; steps: SelectionStep[] | undefined; isError: boolean; readOnly: boolean }

const STATUS_TONE: Record<StepStatus, string> = {
  not_started: 'border border-line bg-cream text-muted',
  scheduled: 'border border-sage-700 bg-surface text-sage-700',
  done: 'bg-sage-100 text-sage-800',
  awaiting_result: 'bg-warn-bg text-warn',
  passed: 'bg-sage-700 text-surface',
  failed: 'bg-danger-bg text-danger',
  withdrawn: 'border border-line bg-surface text-muted',
  exempted: 'bg-sage-100 text-sage-800',
}

// 選考ステップの一覧（設計書 02 §2.4 企業詳細画面、§3.5.2）
export function StepsSection({ companyId, steps, isError, readOnly }: Props) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ step: SelectionStep; initialStatus?: StepStatus } | null>(null)
  const [deleting, setDeleting] = useState<SelectionStep | null>(null)
  const update = useUpdateStep(companyId)
  const reorder = useReorderSteps(companyId)
  const remove = useDeleteStep(companyId)

  const move = (index: number, delta: -1 | 1) => {
    if (!steps) return
    const ids = moveStep(
      steps.map((s) => s.id),
      index,
      delta,
    )
    if (ids) reorder.mutate(ids)
  }
  const busy = update.isPending || reorder.isPending
  const actionError = update.error ?? reorder.error

  return (
    <section aria-labelledby="steps-heading" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="steps-heading" className="text-sm font-semibold text-muted">
          選考ステップ
        </h2>
        {!readOnly && <Button onClick={() => setAdding(true)}>ステップを追加</Button>}
      </div>

      {actionError && (
        <div className="mt-3">
          <ErrorMessage message={userFacingMessage(actionError, '保存できませんでした。もう一度お試しください。')} />
        </div>
      )}

      <div className="mt-3">
        {isError ? (
          <ErrorMessage message="選考ステップを読み込めませんでした。" />
        ) : !steps ? (
          <LoadingScreen />
        ) : steps.length === 0 ? (
          <EmptyState title="ステップはまだありません">
            {readOnly ? null : '「ステップを追加」から、ESや面接などを登録してください。'}
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.id} className="rounded-2xl border border-line p-3" aria-label={step.label}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-all">
                      <span className="mr-1 text-xs text-muted">{index + 1}.</span>
                      {step.label}
                    </p>
                    <StepDates step={step} />
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[step.status]}`}
                  >
                    {STEP_STATUS_LABELS[step.status]}
                  </span>
                </div>
                {!readOnly && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(step.status === 'not_started' || step.status === 'scheduled') && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setEditing({ step, initialStatus: 'scheduled' })}
                      >
                        予定を入れる
                      </Button>
                    )}
                    {quickActionsFor(step.status).map((action) => (
                      <Button
                        key={action}
                        variant={action === 'failed' || action === 'withdrawn' ? 'ghost' : 'secondary'}
                        disabled={busy}
                        onClick={() => update.mutate({ id: step.id, values: quickActionUpdate(action) })}
                      >
                        {QUICK_ACTION_LABELS[action]}
                      </Button>
                    ))}
                    <span className="ml-auto flex gap-1">
                      <IconButton
                        label={`${step.label}を上へ`}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={`${step.label}を下へ`}
                        disabled={busy || index === steps.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </IconButton>
                      <Button variant="ghost" onClick={() => setEditing({ step })} disabled={busy}>
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          remove.reset()
                          setDeleting(step)
                        }}
                        disabled={busy}
                      >
                        削除
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {adding && <AddStepSheet companyId={companyId} onClose={() => setAdding(false)} />}
      {editing && (
        <StepEditSheet step={editing.step} initialStatus={editing.initialStatus} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <Sheet
          title={`「${deleting.label}」を削除しますか？`}
          onClose={() => setDeleting(null)}
          busy={remove.isPending}
        >
          <p className="text-sm">このステップの日付やメモも消えます。削除したことは履歴に残ります。</p>
          {remove.isError && (
            <div className="mt-3">
              <ErrorMessage
                message={userFacingMessage(remove.error, '削除できませんでした。もう一度お試しください。')}
              />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              やめる
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={async () => {
                try {
                  await remove.mutateAsync(deleting.id)
                  setDeleting(null)
                } catch {
                  // remove.error で表示
                }
              }}
            >
              {remove.isPending ? '削除中…' : '削除する'}
            </Button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-xl border border-line text-base text-sage-700 hover:bg-sage-100 disabled:text-muted disabled:opacity-50"
    >
      <span aria-hidden>{children}</span>
    </button>
  )
}

function StepDates({ step }: { step: SelectionStep }) {
  const items: string[] = []
  if (step.deadline_at) items.push(`締切 ${formatJstShort(step.deadline_at, true)}`)
  else if (step.deadline_date) items.push(`締切 ${formatJstShort(step.deadline_date)}`)
  if (step.scheduled_at) items.push(`実施 ${formatJstShort(step.scheduled_at, true)}`)
  if (step.completed_at) items.push(`完了 ${formatJstShort(step.completed_at)}`)
  if (step.result_expected_on) items.push(`結果予定 ${formatJstShort(step.result_expected_on)}`)
  if (step.place) items.push(step.place)
  if (items.length === 0) return null
  return <p className="mt-1 text-xs break-all text-muted">{items.join('・')}</p>
}
