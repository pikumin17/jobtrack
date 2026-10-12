// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 主要な文字色と背景色の組み合わせが WCAG AA（4.5:1）以上であること（テスト 1-12）
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8')
const color = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m?.[1]) throw new Error(`色 ${name} が見つかりません`)
  return m[1]
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const pairs: [string, string][] = [
  ['ink', 'cream'],
  ['ink', 'surface'],
  ['muted', 'cream'],
  ['muted', 'surface'],
  ['sage-700', 'cream'],
  ['sage-700', 'surface'],
  ['sage-800', 'sage-100'],
  ['surface', 'sage-700'],
  ['warn', 'warn-bg'],
  ['danger', 'danger-bg'],
  ['danger', 'surface'],
]

describe('色のコントラスト', () => {
  it.each(pairs)('%s on %s >= 4.5', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5)
  })
})
