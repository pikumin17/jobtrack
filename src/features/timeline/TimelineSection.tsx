import { useState } from 'react'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatJstShort } from '@/lib/dates'
import { useCompanyTimeline } from './api'

const PAGE = 20

// 企業の変更履歴を新しい順に（設計書 02 §2.4 企業詳細画面の最後）。書き換えはできない
export function TimelineSection({ companyId }: { companyId: string }) {
  const timeline = useCompanyTimeline(companyId)
  const [shown, setShown] = useState(PAGE)

  return (
    <section aria-labelledby="timeline-heading" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="timeline-heading" className="text-sm font-semibold text-muted">
        履歴
      </h2>
      <div className="mt-3">
        {timeline.isPending ? (
          <LoadingScreen />
        ) : timeline.isError ? (
          <ErrorMessage message="履歴を読み込めませんでした。" />
        ) : timeline.data.length === 0 ? (
          <p className="text-sm text-muted">まだ履歴はありません。</p>
        ) : (
          <>
            <ol className="space-y-2" aria-label="履歴の一覧">
              {timeline.data.slice(0, shown).map((t) => (
                <li key={t.id} className="flex gap-3 text-sm">
                  <time dateTime={t.occurred_at} className="w-24 shrink-0 text-xs text-muted">
                    {formatJstShort(t.occurred_at, true)}
                  </time>
                  <span className="min-w-0 break-all">{t.summary}</span>
                </li>
              ))}
            </ol>
            {timeline.data.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="mt-2 min-h-11 text-sm font-semibold text-sage-700 underline"
              >
                もっと見る
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
