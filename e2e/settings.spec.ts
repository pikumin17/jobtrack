import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { psql, USERS } from './support'

// フェーズ4: 初回設定・プロフィール・分析・CSV・バックアップと復元
test.use({ storageState: USERS.a.state })

test('初回設定はスキップでき、プロフィールはあとから変えられる', async ({ page }, testInfo) => {
  const name = `E2E ${testInfo.project.name}`
  psql(`update public.profiles set onboarding_completed_at = null where email = '${USERS.a.email}'`)

  // どのページを開いても、まず初回設定へ
  await page.goto('/companies')
  await expect(page.getByRole('heading', { name: 'JobTrack へようこそ' })).toBeVisible()
  await page.getByLabel(/卒業予定年/).fill('20xx')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.getByText('西暦4桁で入力してください')).toBeVisible()
  await page.getByRole('button', { name: 'スキップ' }).click()
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible()

  // 二度と出ない
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible()

  await page.goto('/more')
  await page.getByRole('link', { name: 'プロフィール' }).click()
  await page.getByLabel(/表示名/).fill(name)
  await page.getByLabel(/卒業予定年/).fill('2028')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('status')).toHaveText('保存しました。')
  await page.reload()
  await expect(page.getByLabel(/表示名/)).toHaveValue(name)
})

test('分析に集計が出て、CSV を書き出せる', async ({ page }, testInfo) => {
  const companyName = `E2E分析 ${Date.now()} ${testInfo.project.name}`
  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(companyName)
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByRole('link', { name: new RegExp(companyName) })).toBeVisible()

  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: '分析' })).toBeVisible()
  await expect(page.getByRole('region', { name: '志望度ごとの企業数' })).toContainText('未設定')
  await expect(page.getByLabel('概要')).toContainText('登録企業')

  await page.goto('/more/data')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '企業一覧のCSV' }).click()
  const file = await (await download).path()
  const csv = readFileSync(file, 'utf8')
  expect(csv.startsWith('﻿企業名,')).toBe(true)
  expect(csv).toContain(companyName)
})

test('バックアップを保存し、あとから変えたデータを復元で元に戻せる', async ({ page }, testInfo) => {
  const suffix = `${Date.now()} ${testInfo.project.name}`
  const kept = `E2E残す ${suffix}`
  const later = `E2E後から ${suffix}`

  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(kept)
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByRole('link', { name: new RegExp(kept) })).toBeVisible()

  await page.goto('/more/data')
  const backup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'バックアップを保存' }).click()
  const backupPath = await (await backup).path()
  await expect(page.getByRole('status')).toContainText('バックアップを保存しました')

  // バックアップの後に足した企業
  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(later)
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByRole('link', { name: new RegExp(later) })).toBeVisible()

  // 復元: プレビュー → 今のデータを保存 → 確認の文字 → 復元
  await page.goto('/more/data')
  await page.getByLabel('バックアップのファイル').setInputFiles(backupPath)
  await expect(page.getByRole('table', { name: '復元の前後の件数' })).toBeVisible()
  const restoreButton = page.getByRole('button', { name: '置き換えて復元する' })
  await expect(restoreButton).toBeDisabled()
  const saveCurrent = page.waitForEvent('download')
  await page.getByRole('button', { name: '今のデータを保存' }).click()
  await saveCurrent
  await page.getByLabel(/確認のため/).fill('復元する')
  await restoreButton.click()
  await expect(page.getByRole('status')).toContainText('復元しました')

  await page.goto('/companies')
  await expect(page.getByRole('link', { name: new RegExp(kept) })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(later) })).toHaveCount(0)

  // 書き換えたファイルは復元できない（チェックサム）
  const tampered = JSON.parse(readFileSync(backupPath, 'utf8'))
  tampered.data.companies[0].name = '書き換え'
  await page.goto('/more/data')
  await page.getByLabel('バックアップのファイル').setInputFiles({
    name: 'tampered.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tampered)),
  })
  await expect(page.getByRole('alert')).toContainText('チェックサムが一致しません')
})

test('ほかの利用者のバックアップは復元できない', async ({ page, browser }) => {
  await page.goto('/more/data')
  const backup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'バックアップを保存' }).click()
  const backupPath = await (await backup).path()

  const other = await browser.newContext({ storageState: USERS.b.state })
  const pageB = await other.newPage()
  await pageB.goto('/more/data')
  await pageB.getByLabel('バックアップのファイル').setInputFiles(backupPath)
  await expect(pageB.getByRole('alert')).toContainText('ほかの利用者のバックアップです')
  await other.close()
})
