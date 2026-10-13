import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Sheet } from '@/components/ui/Sheet'
import type { Company } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { formatJstShort } from '@/lib/dates'
import { APPLICATION_TYPE_LABELS, CHANNEL_LABELS, CLOSED_REASON_LABELS, FINAL_OUTCOME_LABELS } from '@/lib/labels'
import { judgeSelectionStatus } from '@/lib/status'
import { useSteps } from '@/features/steps/api'
import { OutcomeSheet } from '@/features/steps/OutcomeSheet'
import { StepsSection } from '@/features/steps/StepsSection'
import { useCompany, useSaveCompanyInfo, useSetPreference } from './api'
import { ApplicationStatusSection } from './ApplicationStatusSection'
import { CompanyForm } from './CompanyForm'
import { PreferenceStars } from './PreferenceStars'
import { isSafeHttpUrl } from './schema'
import { StatusBadge } from './StatusBadge'

// 企業詳細（設計書 02 §2.4）。結果待ち・次回予定・履歴の欄は後続の PR で加える
export function CompanyDetailPage() {
  const { id = '' } = useParams()
  const company = useCompany(id)

  return (
    <>
      <nav className="mb-3">
        <Link to="/companies" className="inline-flex min-h-11 items-center text-sm font-semibold text-sage-700">
          ← 企業一覧
        </Link>
      </nav>
      {company.isPending ? (
        <LoadingScreen />
      ) : company.isError ? (
        <ErrorMessage message="企業の情報を読み込めませんでした。" />
      ) : company.data === null ? (
        <EmptyState title="企業が見つかりません">削除されたか、URLが正しくない可能性があります。</EmptyState>
      ) : (
        <CompanyDetail company={company.data} />
      )}
    </>
  )
}

function CompanyDetail({ company }: { company: Company }) {
  const [editing, setEditing] = useState(false)
  const [recording, setRecording] = useState(false)
  const steps = useSteps(company.id)
  const save = useSaveCompanyInfo(company.id)
  const setPreference = useSetPreference(company.id)
  // ゴミ箱内の企業は読み取りだけ（DB でも拒否される。設計書 02 §3.9）
  const readOnly = company.deleted_at !== null
  // バッジは DB が保存した選考状態と同じ判定表で、読み込んだステップから求める（ステップを変えた直後もずれない。02 §3.5.3）
  const selectionStatus = steps.data
    ? judgeSelectionStatus(company.final_outcome, steps.data).status
    : company.selection_status

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-bold break-all">{company.name}</h1>
          <StatusBadge selectionStatus={selectionStatus} applicationStatus={company.application_status} />
        </div>
        {readOnly && (
          <p role="status" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">
            この企業はゴミ箱に入っています。変更するには、先に復元してください。
          </p>
        )}
        <PreferenceStars
          value={company.preference}
          disabled={readOnly || setPreference.isPending}
          onChange={(value) => setPreference.mutate(value)}
        />
        {setPreference.isError && (
          <ErrorMessage
            message={userFacingMessage(setPreference.error, '志望度を保存できませんでした。もう一度お試しください。')}
          />
        )}
      </header>

      <ApplicationStatusSection company={company} readOnly={readOnly} />

      <section aria-labelledby="outcome-heading" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="outcome-heading" className="text-sm font-semibold text-muted">
          結果
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-semibold">
            {company.final_outcome ? (
              <>
                {FINAL_OUTCOME_LABELS[company.final_outcome]}
                {company.final_outcome_at && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    {formatJstShort(company.final_outcome_at)} 記録
                  </span>
                )}
                {company.closed_reason && (
                  <span className="block text-sm font-normal text-muted">
                    理由: {CLOSED_REASON_LABELS[company.closed_reason]}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">未記録</span>
            )}
          </p>
          {!readOnly && (
            <Button variant="secondary" onClick={() => setRecording(true)}>
              結果を記録
            </Button>
          )}
        </div>
      </section>

      <StepsSection companyId={company.id} steps={steps.data} isError={steps.isError} readOnly={readOnly} />

      <section aria-labelledby="info-heading" className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="info-heading" className="text-sm font-semibold text-muted">
            企業情報
          </h2>
          {!readOnly && (
            <Button
              variant="secondary"
              onClick={() => {
                save.reset()
                setEditing(true)
              }}
            >
              編集
            </Button>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Info label="応募区分">{company.application_type && APPLICATION_TYPE_LABELS[company.application_type]}</Info>
          <Info label="職種">{company.job_type}</Info>
          <Info label="勤務地">{company.location}</Info>
          <Info label="応募経路">{company.channel && CHANNEL_LABELS[company.channel]}</Info>
          <Info label="採用ページ">{company.recruit_url && <ExternalLink url={company.recruit_url} />}</Info>
          <Info label="マイページ">{company.mypage_url && <ExternalLink url={company.mypage_url} />}</Info>
          <Info label="ログインIDのヒント">{company.login_id_hint}</Info>
          <Info label="担当者">{company.contact_person}</Info>
          <Info label="メモ">{company.memo && <span className="whitespace-pre-wrap">{company.memo}</span>}</Info>
        </dl>
      </section>

      {recording && <OutcomeSheet company={company} onClose={() => setRecording(false)} />}
      {editing && (
        <Sheet title="企業情報を編集" onClose={() => setEditing(false)} busy={save.isPending}>
          <CompanyForm
            company={company}
            pending={save.isPending}
            error={save.error}
            onSubmit={async (values) => {
              await save.mutateAsync(values)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        </Sheet>
      )}
    </div>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all">{children || <span className="text-muted">未入力</span>}</dd>
    </>
  )
}

// DB で http(s) に限っているが、表示でも念のため確かめてからリンクにする
function ExternalLink({ url }: { url: string }) {
  if (!isSafeHttpUrl(url)) return <span>{url}</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sage-700 underline">
      {url}
    </a>
  )
}
