import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-sage-700 text-white hover:bg-sage-800 disabled:bg-sage-500',
  secondary: 'border border-line bg-surface text-ink hover:bg-sage-100',
  danger: 'border border-danger bg-surface text-danger hover:bg-danger-bg',
  ghost: 'text-sage-700 hover:bg-sage-100',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

// タップ領域は 44px 以上（設計書 04 テスト 1-11）
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    />
  )
}
