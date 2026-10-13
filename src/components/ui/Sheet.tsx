import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  // 保存中は閉じない
  busy?: boolean
  children: ReactNode
}

// 追加・編集用のシート。スマホは画面下から、PC は中央に出す（設計書 02 §2.2）
export function Sheet({ title, onClose, busy = false, children }: Props) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg outline-none sm:rounded-3xl sm:pb-6"
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
