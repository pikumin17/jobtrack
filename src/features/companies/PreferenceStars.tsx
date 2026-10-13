import { preferenceLabel } from '@/lib/labels'

const LEVELS = [1, 2, 3, 4, 5] as const

function Star({ filled, className = 'size-6' }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

// 表示だけ（一覧用）。未設定は星を枠線だけで描き「志望度 未設定」と薄く出す（1つ星と見分けるため。設計書 02 §2.4）
export function PreferenceDisplay({ preference }: { preference: number | null }) {
  if (preference === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <span className="inline-flex text-muted">
          {LEVELS.map((n) => (
            <Star key={n} filled={false} className="size-4" />
          ))}
        </span>
        志望度 未設定
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs" aria-label={`志望度 ${preferenceLabel(preference)}`}>
      <span className="inline-flex text-warn" aria-hidden>
        {LEVELS.map((n) => (
          <Star key={n} filled={n <= preference} className="size-4" />
        ))}
      </span>
      <span aria-hidden>{preference}</span>
    </span>
  )
}

type Props = {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}

// 志望度の入力。星をタップでその段階、「未設定に戻す」で null（設計書 02 §2.4 変更3）
export function PreferenceStars({ value, onChange, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="group" aria-label="志望度" className="flex text-warn">
        {LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={value === n}
            aria-label={`志望度 ${preferenceLabel(n)}`}
            onClick={() => onChange(n)}
            className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-sage-100 disabled:cursor-not-allowed"
          >
            <Star filled={value !== null && n <= value} className={value === null ? 'size-6 text-muted' : 'size-6'} />
          </button>
        ))}
      </div>
      <span className={`text-sm font-semibold ${value === null ? 'text-muted' : ''}`} aria-live="polite">
        {preferenceLabel(value)}
      </span>
      {value !== null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="min-h-11 rounded-xl px-2 text-sm text-sage-700 underline hover:bg-sage-100"
        >
          未設定に戻す
        </button>
      )}
    </div>
  )
}
