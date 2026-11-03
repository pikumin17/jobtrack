// CSV の書き出し（設計書 02 §6）。ブラウザの中で作り、サーバーを通さない。
// ・Excel で文字化けしないよう UTF-8 の BOM を付ける。改行は CRLF
// ・先頭が = + - @ （とタブ・改行）のセルは ' を前に付け、表計算ソフトで数式として動かないようにする（CSV インジェクション対策）
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** 文字列やバイト列をファイルとして保存させる（ダウンロード） */
export function downloadFile(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // クリックの処理が終わってから解放する
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
