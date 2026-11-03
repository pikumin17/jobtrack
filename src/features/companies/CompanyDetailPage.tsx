import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Sheet } from '@/components/ui/Sheet'
import type { Company } from '@/lib/database.types'
import { userFacingMessage } from '@/lib/errors'
import { formatJstShort } from '@/lib/dates'
import { APPLICATION_TYPE_LABELS, CHANNEL_LABELS, CLOSED_REASON_LABELS, FINAL_OUTCOME_LABELS } from '@/lib/labels'
import { summarizeCompany } from '@/lib/companySummary'
import { dismissWarning, inputWarnings, loadDismissed } from '@/lib/inputWarnings'
import { judgeSelectionStatus } from '@/lib/status'
import { useSteps } from '@/features/steps/api'
import { OutcomeSheet } from '@/features/steps/OutcomeSheet'
import { StepsSection } from '@/features/steps/StepsSection'
import { TimelineSection } from '@/features/timeline/TimelineSection'
import { useRestoreCompany, useTrashCompany } from '@/features/trash/api'
import { useCompany, useSaveCompanyInfo, useSetPreference } from './api'
import { ApplicationStatusSection } from './ApplicationStatusSection'
import { CompanyForm } from './CompanyForm'
import { PreferenceStars } from './PreferenceStars'
import { isSafeHttpUrl } from './schema'
import { StatusBadge } from './StatusBadge'
import { SummaryBlocks } from './SummaryBlocks'

// 企業詳細（設計書 02 §2.4）
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
  const [trashing, setTrashing] = useState(false)
  const trash = useTrashCompany()
  const restore = useRestoreCompany()
  const navigate = useNavigate()
  const steps = useSteps(company.id)
  const save = useSaveCompanyInfo(company.id)
  const setPreference = useSetPreference(company.id)
  // ゴミ箱内の企業は読み取りだけ（DB でも拒否される。設計書 02 §3.9）
  const readOnly = company.deleted_at !== null
  // バッジは DB が保存した選考状態と同じ判定表で、読み込んだステップから求める（ステップを変えた直後もずれない。02 §3.5.3）
  const judged = steps.data
    ? judgeSelectionStatus(company.final_outcome, steps.data)
    : { status: company.selection_status, reason: company.selection_status_reason }
  const selectionStatus = judged.status
  const [dismissed, setDismissed] = useState(loadDismissed)
  // 結果待ち・次回予定・注意と入力警告は表示のたびに求める（保存しない。02 §3.5.5, §3.6）
  const summary = useMemo(
    () =>
      summarizeCompany(
        { ...company, selection_status: judged.status, selection_status_reason: judged.reason },
        steps.data ?? [],
      ),
    [company, judged.status, judged.reason, steps.data],
  )
  const warnings = useMemo(
    () => inputWarnings(company, steps.data ?? []).filter((w) => !dismissed.has(w.fingerprint)),
    [company, steps.data, dismissed],
  )
  const keepAsIs = readOnly ? undefined : (fingerprint: string) => setDismissed(dismissWarning(fingerprint))

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-bold break-all">{company.name}</h1>
          <StatusBadge selectionStatus={selectionStatus} applicationStatus={company.application_status} />
        </div>
        {readOnly && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn"
          >
            <span className="flex-1">この企業はゴミ箱に入っています。変更するには、先に復元してください。</span>
            <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(company.id)}>
              復元
            </Button>
          </div>
        )}
        {restore.isError && (
          <ErrorMessage message={userFacingMessage(restore.error, '復元できませんでした。もう一度お試しください。')} />
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

      <SummaryBlocks summary={summary} warnings={warnings} />

      <ApplicationStatusSection
        company={company}
        readOnly={readOnly}
        warnings={warnings.filter((w) => w.stepId === null)}
        onKeepAsIs={keepAsIs}
      />

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

      <StepsSection
        companyId={company.id}
        steps={steps.data}
        isError={steps.isError}
        readOnly={readOnly}
        warnings={warnings}
        onKeepAsIs={keepAsIs}
      />

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

      <TimelineSection companyId={company.id} />

      {!readOnly && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              trash.reset()
              setTrashing(true)
            }}
          >
            ゴミ箱に入れる
          </Button>
        </div>
      )}
      {trashing && (
        <Sheet title="ゴミ箱に入れますか？" onClose={() => setTrashing(false)} busy={trash.isPending}>
          <p className="text-sm">
            「{company.name}」とその選考ステップ・履歴をゴミ箱に移します。「その他 → ゴミ箱」から元に戻せます。
          </p>
          {trash.isError && (
            <div className="mt-3">
              <ErrorMessage
                message={userFacingMessage(trash.error, 'ゴミ箱に移せませんでした。もう一度お試しください。')}
              />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTrashing(false)} disabled={trash.isPending}>
              やめる
            </Button>
            <Button
              variant="danger"
              disabled={trash.isPending}
              onClick={async () => {
                try {
                  await trash.mutateAsync(company.id)
                  navigate('/companies')
                } catch {
                  // trash.error で表示
                }
              }}
            >
              ゴミ箱に入れる
            </Button>
          </div>
        </Sheet>
      )}

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
