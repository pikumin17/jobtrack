import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  closedReasons,
  formatRate,
  interviewStats,
  monthlyActivity,
  overview,
  passRates,
  preferenceCounts,
  progressByType,
  type AnalyticsCompany,
  type AnalyticsStep,
  type ProgressGroup,
} from '@/lib/analytics'
import { formatMonth } from '@/lib/dates'
import { APPLICATION_TYPE_LABELS, CLOSED_REASON_LABELS, preferenceLabel, STEP_KIND_LABELS } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { StepKind } from '@/lib/database.types'

const KIND_ORDER = Object.keys(STEP_KIND_LABELS) as StepKind[]

// 分析に使う列だけを読む。ゴミ箱の企業とそのステップは数えない
function useAnalyticsData() {
  return useQuery({
    queryKey: ['analytics'],
    // 開くたびに最新の状態で集計する
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<{ companies: AnalyticsCompany[]; steps: AnalyticsStep[] }> => {
      const [companies, steps] = await Promise.all([
        supabase
          .from('companies')
          .select(
            'id, application_type, preference, application_status, applied_on, selection_status, closed_reason, created_at',
          )
          .is('deleted_at', null),
        supabase.from('selection_steps').select('company_id, kind, status, completed_at'),
      ])
      if (companies.error) throw companies.error
      if (steps.error) throw steps.error
      const ids = new Set(companies.data.map((c) => c.id))
      return { companies: companies.data, steps: steps.data.filter((s) => ids.has(s.company_id)) }
    },
  })
}

const PROGRESS_LABELS: Record<ProgressGroup, string> = {
  not_started: '選考前',
  in_progress: '選考中',
  needs_review: '要確認',
  offer: '内定',
  closed: '終了',
}

// 分析（設計書 04 フェーズ4）。グラフは1系列の棒だけにし、数値は必ず文字でも出す（色だけに頼らない）
export function AnalyticsPage() {
  const query = useAnalyticsData()
  const result = useMemo(() => {
    if (!query.data) return undefined
    const { companies, steps } = query.data
    return {
      overview: overview(companies),
      rates: passRates(steps, KIND_ORDER),
      preferences: preferenceCounts(companies),
      byType: progressByType(companies),
      interviews: interviewStats(steps),
      monthly: monthlyActivity(companies, steps),
      reasons: closedReasons(companies),
    }
  }, [query.data])

  return (
    <>
      <PageHeader title="分析" />
      {query.isError ? (
        <ErrorMessage message="分析を読み込めませんでした。" />
      ) : !result ? (
        <LoadingScreen />
      ) : result.overview.companies === 0 ? (
        <EmptyState title="まだ企業が登録されていません">企業を登録すると、ここに集計が出ます。</EmptyState>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="概要">
            <Stat label="登録企業" value={`${result.overview.companies}社`} />
            <Stat label="応募済み" value={`${result.overview.applied}社`} />
            <Stat label="選考中" value={`${result.overview.inProgress}社`} />
            <Stat label="内定" value={`${result.overview.offers}社`} />
            <Stat label="選考終了" value={`${result.overview.closed}社`} />
            <Stat
              label="受けた面接"
              value={`${result.interviews.interviews}回`}
              sub={result.interviews.interviews > 0 ? `${result.interviews.companies}社` : undefined}
            />
          </dl>

          <Card title="ステップ別の通過率" note="分母は「通過＋不合格」。結果待ち・免除・辞退は含めません。">
            {result.rates.length === 0 ? (
              <Empty>選考ステップを追加すると出ます。</Empty>
            ) : (
              <Bars
                rows={result.rates.map((r) => ({
                  key: r.kind,
                  label: STEP_KIND_LABELS[r.kind],
                  value: r.rate,
                  max: 1,
                  text: r.rate === null ? 'データなし' : `${formatRate(r.rate)}（${r.passed}/${r.passed + r.failed}）`,
                }))}
              />
            )}
          </Card>

          <Card title="月ごとの活動（直近6か月）">
            <table className="w-full text-sm">
              <caption className="sr-only">月ごとの企業の登録数・応募数・実施/提出したステップの数</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-1 font-semibold">
                    月
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    登録
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    応募
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    実施・提出
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.monthly.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="py-2 text-left font-normal">
                      {formatMonth(m.month)}
                    </th>
                    <td className="py-2 text-right tabular-nums">{m.registered}</td>
                    <td className="py-2 text-right tabular-nums">{m.applied}</td>
                    <td className="py-2 text-right tabular-nums">{m.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="志望度ごとの企業数">
            <Bars
              rows={result.preferences.map((p) => ({
                key: String(p.preference),
                label: preferenceLabel(p.preference),
                value: p.count,
                max: Math.max(1, ...result.preferences.map((x) => x.count)),
                text: `${p.count}社`,
              }))}
            />
          </Card>

          <Card title="応募区分ごとの進み具合">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 font-semibold">
                      応募区分
                    </th>
                    {(Object.keys(PROGRESS_LABELS) as ProgressGroup[]).map((g) => (
                      <th key={g} scope="col" className="py-1 text-right font-semibold">
                        {PROGRESS_LABELS[g]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.byType.map((row) => (
                    <tr key={String(row.type)}>
                      <th scope="row" className="py-2 text-left font-normal">
                        {row.type ? APPLICATION_TYPE_LABELS[row.type] : '未設定'}
                        <span className="ml-1 text-xs text-muted">{row.total}社</span>
                      </th>
                      {(Object.keys(PROGRESS_LABELS) as ProgressGroup[]).map((g) => (
                        <td key={g} className="py-2 text-right tabular-nums">
                          {row.counts[g]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="選考終了の理由">
            {result.reasons.reasons.length === 0 && result.reasons.unrecorded === 0 ? (
              <Empty>選考が終わった企業はまだありません。</Empty>
            ) : (
              <>
                <Bars
                  rows={result.reasons.reasons.map((r) => ({
                    key: r.reason,
                    label: CLOSED_REASON_LABELS[r.reason],
                    value: r.count,
                    max: Math.max(1, ...result.reasons.reasons.map((x) => x.count)),
                    text: `${r.count}社`,
                  }))}
                />
                {result.reasons.unrecorded > 0 && (
                  <p className="mt-2 text-xs text-muted">理由を記録していない企業: {result.reasons.unrecorded}社</p>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-bold">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-muted">{sub}</span>}
      </dd>
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const id = `analytics-${title}`
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-surface p-4">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>
}

type BarRow = { key: string; label: string; value: number | null; max: number; text: string }

// 1系列の横棒。値は棒の右に文字で出す。値がない行（データなし）は棒を描かない
function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const width = r.value === null ? 0 : Math.max(0, Math.min(1, r.value / r.max)) * 100
        return (
          <li key={r.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
            <span className="truncate text-muted" title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 flex-1 rounded-sm bg-cream" aria-hidden>
                {width > 0 && <span className="block h-3 rounded-r-sm bg-sage-700" style={{ width: `${width}%` }} />}
              </span>
              <span
                className={`w-28 shrink-0 text-right tabular-nums ${r.value === null ? 'text-muted' : 'font-semibold'}`}
              >
                {r.text}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
