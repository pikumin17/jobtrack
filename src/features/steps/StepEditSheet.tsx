import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Sheet } from '@/components/ui/Sheet'
import type { SelectionStep, StepStatus } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { STEP_KIND_LABELS, STEP_STATUS_LABELS } from '@/lib/labels'
import { useUpdateStep } from './api'
import {
  parseStepForm,
  STEP_KINDS,
  STEP_STATUSES,
  stepFormInput,
  type StepFormErrors,
  type StepFormInput,
} from './schema'

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base aria-invalid:border-danger'

type Props = {
  step: SelectionStep
  // 「予定を入れる」から開いたときは状態を「対応予定」にしておく
  initialStatus?: StepStatus
  onClose: () => void
}

// ステップの詳細編集。任意の状態と日付・メモを直接編集できる（設計書 02 §3.5.2）
export function StepEditSheet({ step, initialStatus, onClose }: Props) {
  const update = useUpdateStep(step.company_id)
  const [values, setValues] = useState<StepFormInput>(() => ({
    ...stepFormInput(step),
    ...(initialStatus ? { status: initialStatus } : {}),
  }))
  const [errors, setErrors] = useState<StepFormErrors>({})
  const formId = useId()

  const set = <K extends keyof StepFormInput>(key: K, value: StepFormInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseStepForm(values)
    if ('errors' in parsed) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    try {
      await update.mutateAsync({ id: step.id, values: parsed.values })
      onClose()
    } catch {
      // update.error で表示
    }
  }

  const field = (key: keyof StepFormInput, label: string, control: (id: string, invalid: boolean) => ReactNode) => {
    const id = `${formId}-${key}`
    const message = errors[key]
    return (
      <div>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {control(id, !!message)}
        {message && (
          <p id={`${id}-error`} className="mt-1 text-sm text-danger">
            {message}
          </p>
        )}
      </div>
    )
  }
  const text = (key: 'label' | 'place', maxLength: number) => (id: string, invalid: boolean) => (
    <input
      id={id}
      value={values[key]}
      maxLength={maxLength}
      onChange={(e) => set(key, e.target.value)}
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={inputClass}
    />
  )
  const when =
    (key: 'scheduled_at' | 'scheduled_end_at' | 'completed_at' | 'result_at' | 'result_expected_on', type: string) =>
    (id: string, invalid: boolean) => (
      <input
        id={id}
        type={type}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={inputClass}
      />
    )

  return (
    <Sheet title="ステップを編集" onClose={onClose} busy={update.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {field('label', '名前', text('label', 50))}
        <div className="grid grid-cols-2 gap-3">
          {field('kind', '種別', (id) => (
            <select
              id={id}
              value={values.kind}
              onChange={(e) => set('kind', e.target.value as StepFormInput['kind'])}
              className={inputClass}
            >
              {STEP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STEP_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          ))}
          {field('status', '状態', (id) => (
            <select
              id={id}
              value={values.status}
              onChange={(e) => set('status', e.target.value as StepStatus)}
              className={inputClass}
            >
              {STEP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STEP_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ))}
        </div>
        <p className="text-xs text-muted">結果の連絡がないステップは「実施/提出済み」にできます。</p>

        <fieldset>
          <legend className="text-sm font-semibold">締切</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(['date', 'datetime'] as const).map((mode) => (
              <label key={mode} className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`${formId}-deadline-mode`}
                  checked={values.deadline_mode === mode}
                  onChange={() => setValues((v) => ({ ...v, deadline_mode: mode, deadline: '' }))}
                />
                {mode === 'date' ? '日付だけ' : '時刻まで'}
              </label>
            ))}
          </div>
          <input
            id={`${formId}-deadline`}
            aria-label="締切"
            type={values.deadline_mode === 'date' ? 'date' : 'datetime-local'}
            value={values.deadline}
            onChange={(e) => set('deadline', e.target.value)}
            aria-invalid={!!errors.deadline}
            className={inputClass}
          />
          {errors.deadline && <p className="mt-1 text-sm text-danger">{errors.deadline}</p>}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('scheduled_at', '実施日時', when('scheduled_at', 'datetime-local'))}
          {field('scheduled_end_at', '終了日時', when('scheduled_end_at', 'datetime-local'))}
          {field('completed_at', '完了日（実施・提出した日時）', when('completed_at', 'datetime-local'))}
          {field('result_expected_on', '結果通知予定日', when('result_expected_on', 'date'))}
          {field('result_at', '結果の日時', when('result_at', 'datetime-local'))}
        </div>
        {field('place', '場所・オンラインURL', text('place', 500))}
        {field('memo', 'メモ', (id, invalid) => (
          <textarea
            id={id}
            value={values.memo}
            maxLength={5000}
            rows={4}
            onChange={(e) => set('memo', e.target.value)}
            aria-invalid={invalid}
            className={`${inputClass} py-2`}
          />
        ))}

        {update.isError && (
          <ErrorMessage message={userFacingMessage(update.error, '保存できませんでした。もう一度お試しください。')} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            やめる
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? '保存中…' : '保存'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
