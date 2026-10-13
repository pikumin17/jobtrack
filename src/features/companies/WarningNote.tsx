import type { InputWarning } from '@/lib/inputWarnings'

// 入力警告を該当箇所の横に出す。直すか「このまま」を選べる（02 §3.5.5）
export function WarningNote({
  warning,
  onKeepAsIs,
}: {
  warning: InputWarning
  onKeepAsIs?: (fingerprint: string) => void
}) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-warn-bg px-3 py-1 text-xs text-warn">
      <span>⚠ {warning.message}</span>
      {onKeepAsIs && (
        <button
          type="button"
          onClick={() => onKeepAsIs(warning.fingerprint)}
          className="min-h-11 rounded-lg px-2 font-semibold underline"
        >
          このまま
        </button>
      )}
    </p>
  )
}
