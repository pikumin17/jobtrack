import type { ReactNode } from 'react'

export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean }

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

// 下部ナビ（スマホ）と左サイドナビ（PC）で共通の5項目（設計書 02 §2.2）
export const navItems: NavItem[] = [
  { to: '/', label: 'ホーム', end: true, icon: svg('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { to: '/companies', label: '企業', icon: svg('M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2') },
  { to: '/calendar', label: 'カレンダー', icon: svg('M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14H4zM4 10h16M9 3v4M15 3v4') },
  { to: '/analytics', label: '分析', icon: svg('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { to: '/more', label: 'その他', icon: svg('M5 12h.01M12 12h.01M19 12h.01') },
]
