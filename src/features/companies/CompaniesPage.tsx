import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatJstDate } from '@/lib/dates'
import { userFacingMessage } from '@/lib/errors'
import { companyNameSchema, useAddCompany, useCompanies } from './api'
import { PreferenceDisplay } from './PreferenceStars'
import { StatusBadge } from './StatusBadge'

// 企業一覧。企業名だけで登録でき、任意項目は詳細画面で後から入力する。
// 検索・絞込・並替と、次回予定などを出す一覧は後続の PR（設計書 02 §2.4）
export function CompaniesPage() {
  const companies = useCompanies()
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
      await add.mutateAsync(parsed.data)
      setName('')
    } catch {
      // エラー表示は add.isError で行う
    }
  }

  return (
    <>
      <PageHeader title="企業" />
      <form onSubmit={submit} className="mb-6 rounded-2xl border border-line bg-surface p-4" noValidate>
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

      {companies.isPending ? (
        <LoadingScreen />
      ) : companies.isError ? (
        <ErrorMessage message="企業一覧を読み込めませんでした。" />
      ) : companies.data.length === 0 ? (
        <EmptyState title="まだ企業が登録されていません">上の欄に企業名を入れて追加してください。</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {companies.data.map((c) => (
            <li key={c.id}>
              <Link
                to={`/companies/${c.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-sage-100 focus-visible:bg-sage-100"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold break-all">{c.name}</span>
                  <StatusBadge selectionStatus={c.selection_status} applicationStatus={c.application_status} />
                </span>
                <span className="flex items-center justify-between gap-3">
                  <PreferenceDisplay preference={c.preference} />
                  <span className="shrink-0 text-xs text-muted">{formatJstDate(c.created_at)} 登録</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
