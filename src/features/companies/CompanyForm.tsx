import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import type { Company } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { APPLICATION_TYPE_LABELS, CHANNEL_LABELS } from '@/lib/labels'
import { APPLICATION_TYPES, CHANNELS, companyFormSchema, type CompanyFormInput } from './schema'

type FieldName = keyof CompanyFormInput

function initialValues(company: Company): CompanyFormInput {
  return {
    name: company.name,
    application_type: company.application_type ?? '',
    job_type: company.job_type ?? '',
    location: company.location ?? '',
    channel: company.channel ?? '',
    recruit_url: company.recruit_url ?? '',
    mypage_url: company.mypage_url ?? '',
    login_id_hint: company.login_id_hint ?? '',
    contact_person: company.contact_person ?? '',
    memo: company.memo ?? '',
  }
}

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base aria-invalid:border-danger'

type Props = {
  company: Company
  pending: boolean
  error: unknown
  onSubmit: (values: CompanyFormInput) => Promise<void>
  onCancel: () => void
}

// 企業の基本情報（名前と任意項目）の編集。応募状態・志望度は詳細画面の専用の操作で変える
export function CompanyForm({ company, pending, error, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<CompanyFormInput>(() => initialValues(company))
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const formId = useId()

  const set = (name: FieldName) => (value: string) => setValues((v) => ({ ...v, [name]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = companyFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSubmit(values)
    } catch {
      // error で表示
    }
  }

  const field = (name: FieldName, label: string, control: (props: FieldProps) => ReactNode, hint?: ReactNode) => {
    const id = `${formId}-${name}`
    const message = errors[name]
    return (
      <div>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {control({
          id,
          value: values[name] ?? '',
          onChange: set(name),
          invalid: !!message,
          describedBy: message ? `${id}-error` : hint ? `${id}-hint` : undefined,
        })}
        {hint && !message && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )}
        {message && (
          <p id={`${id}-error`} className="mt-1 text-sm text-danger">
            {message}
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {field('name', '企業名（必須）', (p) => (
        <TextInput {...p} maxLength={100} />
      ))}
      {field('application_type', '応募区分', (p) => (
        <Select {...p} options={APPLICATION_TYPES.map((v) => [v, APPLICATION_TYPE_LABELS[v]])} />
      ))}
      {field('job_type', '職種', (p) => (
        <TextInput {...p} maxLength={100} />
      ))}
      {field('location', '勤務地', (p) => (
        <TextInput {...p} maxLength={100} />
      ))}
      {field('channel', '応募経路', (p) => (
        <Select {...p} options={CHANNELS.map((v) => [v, CHANNEL_LABELS[v]])} />
      ))}
      {field('recruit_url', '採用ページ', (p) => (
        <TextInput {...p} type="url" inputMode="url" placeholder="https://" />
      ))}
      {field('mypage_url', 'マイページ', (p) => (
        <TextInput {...p} type="url" inputMode="url" placeholder="https://" />
      ))}
      {field(
        'login_id_hint',
        'ログインIDのヒント',
        (p) => (
          <TextInput {...p} maxLength={200} autoComplete="off" />
        ),
        <span className="font-semibold text-warn">パスワードは入力しないでください。</span>,
      )}
      {field('contact_person', '担当者', (p) => (
        <TextInput {...p} maxLength={100} />
      ))}
      {field(
        'memo',
        'メモ',
        (p) => (
          <textarea
            id={p.id}
            value={p.value}
            onChange={(e) => p.onChange(e.target.value)}
            aria-invalid={p.invalid}
            aria-describedby={p.describedBy}
            maxLength={5000}
            rows={5}
            className={`${inputClass} py-2`}
          />
        ),
        '5000文字まで',
      )}

      {error ? (
        <ErrorMessage message={userFacingMessage(error, '保存できませんでした。もう一度お試しください。')} />
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          やめる
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  )
}

type FieldProps = {
  id: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  describedBy: string | undefined
}

function TextInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  ...rest
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'>) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={inputClass}
      {...rest}
    />
  )
}

function Select({ id, value, onChange, invalid, describedBy, options }: FieldProps & { options: [string, string][] }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={inputClass}
    >
      <option value="">未設定</option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}
