import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { userFacingMessage } from '@/lib/errors'
import { companyNameSchema, useAddCompany } from './api'

// 企業の簡単登録（企業名だけ。任意項目は詳細画面で後から入力する）。新しい企業は未応募で作られる
export function QuickAddCompany({ onAdded }: { onAdded?: (id: string) => void }) {
  const add = useAddCompany()
  const [name, setName] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = companyNameSchema.safeParse(name)
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? '入力内容を確認してください')
      return
    }
    setInputError(null)
    try {
      const id = await add.mutateAsync(parsed.data)
      setName('')
      onAdded?.(id)
    } catch {
      // エラー表示は add.isError で行う
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4" noValidate>
      <label htmlFor="company-name" className="text-sm font-semibold">
        企業名
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="company-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="例: 株式会社サンプル"
          aria-invalid={!!inputError}
          aria-describedby={inputError ? 'company-name-error' : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 text-base"
        />
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? '追加中…' : '追加'}
        </Button>
      </div>
      {inputError && (
        <p id="company-name-error" className="mt-2 text-sm text-danger">
          {inputError}
        </p>
      )}
      {add.isError && (
        <div className="mt-3">
          <ErrorMessage message={userFacingMessage(add.error, '保存できませんでした。もう一度お試しください。')} />
        </div>
      )}
    </form>
  )
}
