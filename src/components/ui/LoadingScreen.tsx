export function LoadingScreen({ label = '読み込み中…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center text-muted">
      <span className="mr-3 size-5 animate-spin rounded-full border-2 border-sage-300 border-t-sage-700" aria-hidden />
      {label}
    </div>
  )
}
