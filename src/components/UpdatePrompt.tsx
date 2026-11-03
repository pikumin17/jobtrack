import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

// 新しい版が公開されたときのお知らせ（02 D10）。押したときだけ切り替える（入力中の内容を消さないため）
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg md:bottom-6"
    >
      <p className="text-sm">新しい版があります。</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          あとで
        </Button>
        <Button onClick={() => void updateServiceWorker(true)}>更新する</Button>
      </div>
    </div>
  )
}
