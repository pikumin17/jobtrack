import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <Link to="/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-sage-700 underline">
        ホームに戻る
      </Link>
    </main>
  )
}
