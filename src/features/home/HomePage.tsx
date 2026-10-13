import { Link, useNavigate } from 'react-router'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { QuickAddCompany } from '@/features/companies/QuickAddCompany'
import { useCompanyRows } from '@/features/companies/useCompanyRows'
import { useRecentTimeline } from '@/features/timeline/api'
import { formatJstDate, formatJstShort, todayJst } from '@/lib/dates'
import { homeCounts, type HomeCounts } from './homeCounts'

const RECENT = 5

// ホーム（第1版）。直近期限・優先タスクはフェーズ3で加える
export function HomePage() {
  const { rows, isError } = useCompanyRows()
  const recent = useRecentTimeline()
  const navigate = useNavigate()
  const names = new Map(rows?.map((r) => [r.company.id, r.company.name]))
  const recentItems = (recent.data ?? []).filter((t) => t.company_id && names.has(t.company_id)).slice(0, RECENT)

  return (
    <>
      <PageHeader title="ホーム" />
      <p className="text-sm text-muted">今日は {formatJstDate(todayJst())} です。</p>

      {isError ? (
        <div className="mt-4">
          <ErrorMessage message="集計を読み込めませんでした。" />
        </div>
      ) : !rows ? (
        <LoadingScreen />
      ) : (
        <Counts counts={homeCounts(rows)} />
      )}

      <section aria-labelledby="quick-add-heading" className="mt-6">
        <h2 id="quick-add-heading" className="mb-2 text-sm font-semibold text-muted">
          企業をすぐ登録
        </h2>
        <QuickAddCompany onAdded={(id) => navigate(`/companies/${id}`)} />
      </section>

      <section aria-labelledby="recent-heading" className="mt-6">
        <h2 id="recent-heading" className="mb-2 text-sm font-semibold text-muted">
          最近の更新
        </h2>
        {recent.isError ? (
          <ErrorMessage message="最近の更新を読み込めませんでした。" />
        ) : recentItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            まだ更新はありません。
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {recentItems.map((t) => (
              <li key={t.id}>
                <Link to={`/companies/${t.company_id}`} className="block px-4 py-3 hover:bg-sage-100">
                  <span className="flex justify-between gap-3 text-xs text-muted">
                    <span className="truncate font-semibold text-ink">{names.get(t.company_id!)}</span>
                    <time dateTime={t.occurred_at}>{formatJstShort(t.occurred_at, true)}</time>
                  </span>
                  <span className="mt-0.5 block text-sm break-all">{t.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Counts({ counts }: { counts: HomeCounts }) {
  const items: [string, string][] = [
    ['登録企業', `${counts.companies}社`],
    ['応募済み', `${counts.applied}社`],
    ['選考中', `${counts.inProgress}社`],
    ['結果待ち', `${counts.awaitingSteps}件／${counts.awaitingCompanies}社`],
  ]
  // 要確認は1件以上のときだけ出す
  if (counts.needsReview > 0) items.push(['要確認', `${counts.needsReview}社`])
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="集計">
      {items.map(([label, value]) => (
        <div
          key={label}
          className={`rounded-2xl border bg-surface p-4 ${label === '要確認' ? 'border-warn' : 'border-line'}`}
        >
          <dt className={`text-xs ${label === '要確認' ? 'font-semibold text-warn' : 'text-muted'}`}>{label}</dt>
          <dd className="mt-1 text-xl font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
