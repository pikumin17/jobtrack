import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Sheet } from '@/components/ui/Sheet'
import { useCompanies } from '@/features/companies/api'
import type { JobEvent, Task } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { useAddEvent, useAddTask, useDeleteEvent, useDeleteTask, useUpdateEvent, useUpdateTask } from './api'
import {
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  emptyEventForm,
  emptyTaskForm,
  eventFormInput,
  parseEventForm,
  parseTaskForm,
  PRIORITY_LABELS,
  taskFormInput,
  type EventFormErrors,
  type EventFormInput,
  type TaskFormErrors,
  type TaskFormInput,
} from './schema'

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base aria-invalid:border-danger'

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: (invalid: boolean) => ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(!!error)}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

// 紐付ける企業（任意）。ゴミ箱の企業は出さない
function CompanySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const companies = useCompanies()
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">紐付けない</option>
      {(companies.data ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function DeleteRow({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <div className="rounded-xl border border-danger bg-danger-bg p-3 text-sm">
      <p>削除すると元に戻せません。削除しますか？</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          やめる
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={busy}>
          削除する
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)} disabled={busy}>
      削除
    </Button>
  )
}

// ---------------------------------------------------------------- 予定
type EventSheetProps = { onClose: () => void } & (
  | { event: JobEvent; day?: never; companyId?: never }
  | { event?: never; day: string; companyId?: string }
)

export function EventSheet({ event, day, companyId, onClose }: EventSheetProps) {
  const add = useAddEvent()
  const update = useUpdateEvent()
  const remove = useDeleteEvent()
  const [values, setValues] = useState<EventFormInput>(() =>
    event ? eventFormInput(event) : emptyEventForm(day!, companyId),
  )
  const [errors, setErrors] = useState<EventFormErrors>({})
  const formId = useId()
  const busy = add.isPending || update.isPending || remove.isPending
  const error = add.error ?? update.error ?? remove.error
  const set = <K extends keyof EventFormInput>(key: K, value: EventFormInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const id = (key: string) => `${formId}-${key}`
  const aria = (key: keyof EventFormInput) => ({
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `${id(key)}-error` : undefined,
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = parseEventForm(values)
    if ('errors' in parsed) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    try {
      if (event) await update.mutateAsync({ id: event.id, values: parsed.values })
      else await add.mutateAsync(parsed.values)
      onClose()
    } catch {
      // error で表示
    }
  }

  return (
    <Sheet title={event ? '予定を編集' : '予定を追加'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id={id('title')} label="名前" error={errors.title}>
          {() => (
            <input
              id={id('title')}
              value={values.title}
              maxLength={100}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
              {...aria('title')}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id('kind')} label="種別" error={errors.kind}>
            {() => (
              <select
                id={id('kind')}
                value={values.kind}
                onChange={(e) => set('kind', e.target.value as EventFormInput['kind'])}
                className={inputClass}
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={id('company')} label="企業">
            {() => (
              <CompanySelect id={id('company')} value={values.company_id} onChange={(v) => set('company_id', v)} />
            )}
          </Field>
        </div>

        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={values.all_day} onChange={(e) => set('all_day', e.target.checked)} />
          終日
        </label>
        {values.all_day ? (
          <Field id={id('date')} label="日付" error={errors.date}>
            {() => (
              <input
                id={id('date')}
                type="date"
                value={values.date}
                onChange={(e) => set('date', e.target.value)}
                className={inputClass}
                {...aria('date')}
              />
            )}
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={id('starts_at')} label="開始日時" error={errors.starts_at}>
              {() => (
                <input
                  id={id('starts_at')}
                  type="datetime-local"
                  value={values.starts_at}
                  onChange={(e) => set('starts_at', e.target.value)}
                  className={inputClass}
                  {...aria('starts_at')}
                />
              )}
            </Field>
            <Field id={id('ends_at')} label="終了日時（任意）" error={errors.ends_at}>
              {() => (
                <input
                  id={id('ends_at')}
                  type="datetime-local"
                  value={values.ends_at}
                  onChange={(e) => set('ends_at', e.target.value)}
                  className={inputClass}
                  {...aria('ends_at')}
                />
              )}
            </Field>
          </div>
        )}

        <Field id={id('place')} label="場所" error={errors.place}>
          {() => (
            <input
              id={id('place')}
              value={values.place}
              maxLength={500}
              onChange={(e) => set('place', e.target.value)}
              className={inputClass}
              {...aria('place')}
            />
          )}
        </Field>
        <Field id={id('url')} label="URL（オンラインの会場・申込ページ）" error={errors.url}>
          {() => (
            <input
              id={id('url')}
              type="url"
              inputMode="url"
              value={values.url}
              onChange={(e) => set('url', e.target.value)}
              className={inputClass}
              {...aria('url')}
            />
          )}
        </Field>
        <Field id={id('memo')} label="メモ" error={errors.memo}>
          {() => (
            <textarea
              id={id('memo')}
              value={values.memo}
              maxLength={5000}
              rows={3}
              onChange={(e) => set('memo', e.target.value)}
              className={`${inputClass} py-2`}
              {...aria('memo')}
            />
          )}
        </Field>

        {error && <ErrorMessage message={userFacingMessage(error, '保存できませんでした。もう一度お試しください。')} />}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {event && (
              <DeleteRow
                busy={busy}
                onDelete={async () => {
                  try {
                    await remove.mutateAsync(event.id)
                    onClose()
                  } catch {
                    // error で表示
                  }
                }}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              やめる
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------- タスク
type TaskSheetProps = { onClose: () => void } & (
  | { task: Task; companyId?: never; day?: never }
  | { task?: never; companyId?: string; day?: string }
)

export function TaskSheet({ task, companyId, day, onClose }: TaskSheetProps) {
  const add = useAddTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const [values, setValues] = useState<TaskFormInput>(() =>
    task ? taskFormInput(task) : emptyTaskForm(companyId, day),
  )
  const [errors, setErrors] = useState<TaskFormErrors>({})
  const formId = useId()
  const busy = add.isPending || update.isPending || remove.isPending
  const error = add.error ?? update.error ?? remove.error
  const set = <K extends keyof TaskFormInput>(key: K, value: TaskFormInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const id = (key: string) => `${formId}-${key}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = parseTaskForm(values)
    if ('errors' in parsed) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    try {
      if (task) await update.mutateAsync({ id: task.id, values: parsed.values })
      else await add.mutateAsync(parsed.values)
      onClose()
    } catch {
      // error で表示
    }
  }

  return (
    <Sheet title={task ? 'タスクを編集' : 'タスクを追加'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id={id('title')} label="やること" error={errors.title}>
          {(invalid) => (
            <input
              id={id('title')}
              value={values.title}
              maxLength={100}
              onChange={(e) => set('title', e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id('title')}-error` : undefined}
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id('priority')} label="優先度" error={errors.priority}>
            {() => (
              <select
                id={id('priority')}
                value={values.priority}
                onChange={(e) => set('priority', Number(e.target.value) as 1 | 2 | 3)}
                className={inputClass}
              >
                {([1, 2, 3] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={id('company')} label="企業">
            {() => (
              <CompanySelect id={id('company')} value={values.company_id} onChange={(v) => set('company_id', v)} />
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">期日</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
            {(
              [
                ['none', 'なし'],
                ['date', '日付だけ'],
                ['datetime', '時刻まで'],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={id('due-mode')}
                  checked={values.due_mode === mode}
                  onChange={() => setValues((v) => ({ ...v, due_mode: mode, due: '' }))}
                />
                {label}
              </label>
            ))}
          </div>
          {values.due_mode !== 'none' && (
            <input
              aria-label="期日"
              type={values.due_mode === 'date' ? 'date' : 'datetime-local'}
              value={values.due}
              onChange={(e) => set('due', e.target.value)}
              aria-invalid={!!errors.due}
              className={inputClass}
            />
          )}
          {errors.due && <p className="mt-1 text-sm text-danger">{errors.due}</p>}
        </fieldset>

        <Field id={id('memo')} label="メモ" error={errors.memo}>
          {(invalid) => (
            <textarea
              id={id('memo')}
              value={values.memo}
              maxLength={5000}
              rows={3}
              onChange={(e) => set('memo', e.target.value)}
              aria-invalid={invalid}
              className={`${inputClass} py-2`}
            />
          )}
        </Field>

        {error && <ErrorMessage message={userFacingMessage(error, '保存できませんでした。もう一度お試しください。')} />}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {task && (
              <DeleteRow
                busy={busy}
                onDelete={async () => {
                  try {
                    await remove.mutateAsync(task.id)
                    onClose()
                  } catch {
                    // error で表示
                  }
                }}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              やめる
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
