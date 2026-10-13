import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageHeader } from '@/components/ui/PageHeader'
import { Sheet } from '@/components/ui/Sheet'
import type { ApplicationType } from '@/lib/database.types'
import { formatJstShort } from '@/lib/dates'
import { APPLICATION_STATUS_LABELS, APPLICATION_TYPE_LABELS, preferenceLabel } from '@/lib/labels'
import {
  countFilters,
  EMPTY_FILTERS,
  queryCompanies,
  SELECTION_GROUP_LABELS,
  SORT_LABELS,
  type ListFilters,
  type ListRow,
  type PreferenceFilter,
  type SelectionGroup,
  type Situation,
  type SortKey,
} from './listQuery'
import { PreferenceDisplay } from './PreferenceStars'
import { QuickAddCompany } from './QuickAddCompany'
import { APPLICATION_TYPES } from './schema'
import { StatusBadge } from './StatusBadge'
import { awaitingText, daysLeftText, scheduleText } from './summaryText'
import { useCompanyRows } from './useCompanyRows'
import { latestByCompany, useRecentTimeline, type TimelineItem } from '@/features/timeline/api'

type View = 'compact' | 'card'
const VIEW_KEY = 'jobtrack.companies.view'

// 表示の切替は端末に記憶する（設計書 04 フェーズ2）。読めなくてもコンパクト表示になるだけ
function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'compact'
  } catch {
    return 'compact'
  }
}
function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // 記憶できなくても表示は切り替わる
  }
}

// 企業一覧（設計書 02 §2.4）。企業名だけで登録でき、任意項目は詳細画面で後から入力する
export function CompaniesPage() {
  const { rows, isError } = useCompanyRows()
  const [view, setView] = useState<View>(loadView)
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>('next')
  const [filtering, setFiltering] = useState(false)
  const shown = useMemo(() => (rows ? queryCompanies(rows, filters, sort) : undefined), [rows, filters, sort])
  const filterCount = countFilters(filters)
  const recent = useRecentTimeline(300, view === 'card')
  const latest = useMemo(() => latestByCompany(recent.data ?? []), [recent.data])

  return (
    <>
      <PageHeader title="企業" />
      <div className="mb-4">
        <QuickAddCompany />
      </div>

      {rows && rows.length > 0 && (
        <div className="mb-3 space-y-2">
          <input
            type="search"
            aria-label="企業名・職種・メモで検索"
            placeholder="企業名・職種・メモで検索"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setFiltering(true)}>
              絞り込み{filterCount > 0 ? `（${filterCount}）` : ''}
            </Button>
            <label className="sr-only" htmlFor="company-sort">
              並べ替え
            </label>
            <select
              id="company-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <div role="group" aria-label="表示" className="ml-auto flex rounded-xl border border-line bg-surface p-0.5">
              {(['compact', 'card'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v)
                    saveView(v)
                  }}
                  className="min-h-10 rounded-lg px-3 text-sm aria-pressed:bg-sage-700 aria-pressed:font-semibold aria-pressed:text-surface"
                >
                  {v === 'compact' ? 'コンパクト' : '詳細カード'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isError ? (
        <ErrorMessage message="企業一覧を読み込めませんでした。" />
      ) : !shown || !rows ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState title="まだ企業が登録されていません">上の欄に企業名を入れて追加してください。</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="条件に合う企業はありません">
          <button type="button" className="min-h-11 underline" onClick={() => setFilters(EMPTY_FILTERS)}>
            条件をすべて外す
          </button>
        </EmptyState>
      ) : view === 'compact' ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" aria-label="企業一覧">
          {shown.map((row) => (
            <CompactRow key={row.company.id} row={row} />
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="企業一覧">
          {shown.map((row) => (
            <CardRow key={row.company.id} row={row} latest={latest.get(row.company.id)} />
          ))}
        </ul>
      )}

      {filtering && (
        <FilterSheet
          value={filters}
          onChange={setFilters}
          onClose={() => setFiltering(false)}
          resultCount={shown?.length ?? 0}
        />
      )}
    </>
  )
}

const hasAttention = (row: ListRow) => row.summary.notices.length + row.warningCount > 0

function Chips({ row }: { row: ListRow }) {
  const { awaiting, overdue } = row.summary
  return (
    <span className="flex shrink-0 gap-1">
      {awaiting.length > 0 && (
        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
          結果待ち {awaiting.length}
        </span>
      )}
      {overdue.length > 0 && (
        <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">
          超過 {overdue.length}
        </span>
      )}
    </span>
  )
}

// 1社2行（02 §2.4 コンパクト一覧）
function CompactRow({ row }: { row: ListRow }) {
  const { company, summary } = row
  const next = summary.next[0]
  const awaiting = summary.awaiting[0]
  return (
    <li>
      <Link to={`/companies/${company.id}`} className="block px-4 py-3 hover:bg-sage-100 focus-visible:bg-sage-100">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{company.name}</span>
          <PreferenceDisplay preference={company.preference} />
          <StatusBadge selectionStatus={company.selection_status} applicationStatus={company.application_status} />
          {hasAttention(row) && (
            <span className="text-warn" aria-label="注意あり" role="img">
              ⚠
            </span>
          )}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted">
          <span className="min-w-0 flex-1 truncate">
            {next ? (
              <>
                次: {scheduleText(next)} {daysLeftText(next)}
              </>
            ) : awaiting ? (
              <>結果待ち: {awaitingText(awaiting)}</>
            ) : (
              '予定なし'
            )}
          </span>
          <Chips row={row} />
        </span>
      </Link>
    </li>
  )
}

// 詳細カード（02 §2.4）
function CardRow({ row, latest }: { row: ListRow; latest: TimelineItem | undefined }) {
  const { company, summary } = row
  const attention = summary.notices.length + row.warningCount
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <Link to={`/companies/${company.id}`} className="block space-y-2 p-4 hover:bg-sage-100 focus-visible:bg-sage-100">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold break-all">{company.name}</span>
          <StatusBadge selectionStatus={company.selection_status} applicationStatus={company.application_status} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <PreferenceDisplay preference={company.preference} />
          {company.preference !== null && <span>{preferenceLabel(company.preference)}</span>}
          <span>
            {company.applied_on
              ? `${APPLICATION_STATUS_LABELS.applied} ${formatJstShort(company.applied_on)}`
              : APPLICATION_STATUS_LABELS.not_applied}
          </span>
        </span>
        {summary.overdue.length > 0 && (
          <span className="block rounded-xl border border-danger px-3 py-2 text-xs text-danger">
            {summary.overdue.map((o) => o.message).join(' / ')}
          </span>
        )}
        {summary.awaiting.length > 0 && (
          <span className="block text-xs">
            <span className="font-semibold text-warn">結果待ち</span>{' '}
            {summary.awaiting.map((a) => awaitingText(a)).join(' / ')}
          </span>
        )}
        {summary.next.length > 0 && (
          <span className="block text-xs">
            <span className="font-semibold">次回予定</span>{' '}
            {summary.next
              .slice(0, 3)
              .map((i) => scheduleText(i))
              .join(' / ')}
            {summary.next.length > 3 && <span className="text-muted"> 他{summary.next.length - 3}件</span>}
          </span>
        )}
        {attention > 0 && <span className="block text-xs font-semibold text-warn">⚠ 注意 {attention}件</span>}
        {latest && (
          <span className="block truncate text-xs text-muted">
            最新: {formatJstShort(latest.occurred_at)} {latest.summary}
          </span>
        )}
      </Link>
    </li>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function FilterSheet({
  value,
  onChange,
  onClose,
  resultCount,
}: {
  value: ListFilters
  onChange: (f: ListFilters) => void
  onClose: () => void
  resultCount: number
}) {
  const group = <K extends keyof Omit<ListFilters, 'q'>>(
    key: K,
    title: string,
    options: [ListFilters[K][number], string][],
  ) => (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold">{title}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(([v, label]) => {
          const list = value[key] as ListFilters[K][number][]
          return (
            <label
              key={String(v)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm has-checked:border-sage-700 has-checked:bg-sage-100"
            >
              <input
                type="checkbox"
                checked={list.includes(v)}
                onChange={() => onChange({ ...value, [key]: toggle(list, v) })}
              />
              {label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  return (
    <Sheet title="絞り込み" onClose={onClose}>
      {group('application', '応募状態', [
        ['not_applied', '未応募'],
        ['applied', '応募済み'],
      ])}
      {group(
        'selection',
        '選考状態',
        (Object.keys(SELECTION_GROUP_LABELS) as SelectionGroup[]).map((g) => [g, SELECTION_GROUP_LABELS[g]]),
      )}
      {group('preference', '志望度', [
        ...([5, 4, 3, 2, 1] as PreferenceFilter[]).map((p): [PreferenceFilter, string] => [p, String(p)]),
        ['unset', '未設定'],
      ])}
      {group('situation', '状況', [
        ['awaiting', '結果待ちあり'],
        ['overdue', '期限超過あり'],
        ['notice', '注意表示あり'],
      ] as [Situation, string][])}
      {group('applicationType', '応募区分', [
        ...APPLICATION_TYPES.map((t): [ApplicationType, string] => [t, APPLICATION_TYPE_LABELS[t]]),
        ['unset', '未設定'],
      ])}
      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q })}>
          条件を外す
        </Button>
        <Button onClick={onClose}>{resultCount}社を表示</Button>
      </div>
    </Sheet>
  )
}
