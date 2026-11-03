import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import type { Profile } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { profileSchema, type ProfileInput, type ProfileValues } from './profileApi'

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-line bg-cream px-3 text-base aria-invalid:border-danger'

type Props = {
  profile: Profile
  submitLabel: string
  onSubmit: (values: ProfileValues) => Promise<void>
  busy: boolean
  error: unknown
  secondary?: React.ReactNode
}

export function ProfileForm({ profile, submitLabel, onSubmit, busy, error, secondary }: Props) {
  const formId = useId()
  const [values, setValues] = useState<ProfileInput>({
    display_name: profile.display_name ?? '',
    graduation_year: profile.graduation_year?.toString() ?? '',
    purpose: profile.purpose ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileInput, string>>>({})

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = profileSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) as Partial<
          Record<keyof ProfileInput, string>
        >,
      )
      return
    }
    setErrors({})
    await onSubmit(parsed.data).catch(() => undefined)
  }

  const field = (key: keyof ProfileInput, label: string, hint: string, props: Record<string, unknown> = {}) => {
    const id = `${formId}-${key}`
    return (
      <div>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
          <span className="ml-1 text-xs font-normal text-muted">（任意）</span>
        </label>
        <input
          id={id}
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          aria-invalid={!!errors[key]}
          aria-describedby={`${id}-hint`}
          className={inputClass}
          {...props}
        />
        <p id={`${id}-hint`} className={`mt-1 text-xs ${errors[key] ? 'text-danger' : 'text-muted'}`}>
          {errors[key] ?? hint}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {field('display_name', '表示名', 'アプリの中で使う呼び名です', { maxLength: 50, autoComplete: 'nickname' })}
      {field('graduation_year', '卒業予定年', '例: 2028', { inputMode: 'numeric', maxLength: 4 })}
      {field('purpose', '利用目的', '例: 本選考とインターンの管理', { maxLength: 200 })}
      {error != null && (
        <ErrorMessage message={userFacingMessage(error, '保存できませんでした。もう一度お試しください。')} />
      )}
      <div className="flex justify-end gap-2 pt-2">
        {secondary}
        <Button type="submit" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
