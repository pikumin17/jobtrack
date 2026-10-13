import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatJstDate, todayJst } from '@/lib/dates'

export function HomePage() {
  return (
    <>
      <PageHeader title="ホーム" />
      <p className="text-sm text-muted">今日は {formatJstDate(todayJst())} です。</p>
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">ホームの集計はフェーズ2で作ります。</p>
        <p className="mt-1 text-sm text-muted">
          今は
          <Link to="/companies" className="font-semibold text-sage-700 underline">
            企業
          </Link>
          から、企業名だけで登録と一覧表示ができます。
        </p>
      </div>
    </>
  )
}
