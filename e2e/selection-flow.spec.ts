import { expect, test, type Page } from '@playwright/test'
import { psql, USERS } from './support'

// 設計書 04 フェーズ2 のテスト 2-08〜2-10
test.use({ storageState: USERS.a.state })

async function addCompany(page: Page, name: string) {
  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(name)
  await page.getByRole('button', { name: '追加' }).click()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

const step = (page: Page, name: string) => page.getByRole('listitem', { name, exact: true })
const badge = (page: Page) => page.getByTestId('status-badge')

async function pass(page: Page, name: string) {
  await step(page, name).getByRole('button', { name: '提出した／受けた' }).click()
  await step(page, name).getByRole('button', { name: '通過' }).click()
  await expect(step(page, name).getByText('通過', { exact: true })).toBeVisible()
}

async function recordOutcome(page: Page, outcome: string) {
  await page.getByRole('button', { name: '結果を記録' }).click()
  const sheet = page.getByRole('dialog', { name: '結果を記録' })
  await sheet.getByRole('radio', { name: outcome, exact: true }).click()
  await sheet.getByRole('button', { name: '記録する' }).click()
  await expect(sheet).toBeHidden()
}

test('2-08 応募から内定まで（結果待ちと次回予定を同時に表示）', async ({ page }, testInfo) => {
  const name = `E2E通し ${Date.now()} ${testInfo.project.name}`
  await addCompany(page, name)
  await expect(badge(page)).toHaveText('未応募')

  await page.getByRole('button', { name: '応募済みにする' }).click()
  await page.getByRole('dialog', { name: '応募済みにする' }).getByRole('button', { name: '保存' }).click()
  await expect(badge(page)).toHaveText('応募済み')

  await page.getByRole('button', { name: 'ステップを追加' }).click()
  await page.getByRole('button', { name: 'まとめて追加' }).click()
  await expect(page.getByRole('region', { name: '選考ステップ' }).getByRole('listitem')).toHaveCount(5)

  await pass(page, 'ES')
  await expect(badge(page)).toHaveText('選考中')
  await pass(page, 'Webテスト')

  // 一次面接は結果待ちのまま、二次面接の予定を入れる
  await step(page, '一次面接').getByRole('button', { name: '提出した／受けた' }).click()
  await step(page, '二次面接').getByRole('button', { name: '予定を入れる' }).click()
  const edit = page.getByRole('dialog', { name: 'ステップを編集' })
  await edit.getByLabel('実施日時').fill('2030-01-15T14:00')
  await edit.getByRole('button', { name: '保存' }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByRole('region', { name: '結果待ち' })).toContainText('一次面接')
  await expect(page.getByRole('region', { name: '次回予定' })).toContainText('二次面接 1/15(火) 14:00')

  // 一覧でも両方が見える
  await page.getByRole('link', { name: '← 企業一覧' }).click()
  const row = page.getByRole('link', { name: new RegExp(name) })
  await expect(row).toContainText('次: 二次面接 1/15(火) 14:00')
  await expect(row).toContainText('結果待ち 1')
  await row.click()

  await step(page, '一次面接').getByRole('button', { name: '通過' }).click()
  await expect(step(page, '一次面接').getByText('通過', { exact: true })).toBeVisible()
  await pass(page, '二次面接')
  await pass(page, '最終面接')
  // 全通過でも内定とは推測しない（E-3 の注意）
  await expect(badge(page)).toHaveText('選考中')
  await expect(page.getByRole('region', { name: '注意' })).toContainText('すべてのステップを通過しました')

  await recordOutcome(page, '内定')
  await expect(badge(page)).toHaveText('内定')
  await expect(page.getByRole('region', { name: '履歴' })).toContainText('結果を記録: 内定')
})

test('2-09 Webテストなし・面接1回・書類免除', async ({ page }, testInfo) => {
  const name = `E2E短い選考 ${Date.now()} ${testInfo.project.name}`
  await addCompany(page, name)
  for (const label of ['ES', '一次面接']) {
    await page.getByRole('button', { name: 'ステップを追加' }).click()
    const sheet = page.getByRole('dialog', { name: 'ステップを追加' })
    await sheet.getByRole('button', { name: label, exact: true }).click()
    await sheet.getByRole('button', { name: '追加', exact: true }).click()
    await expect(sheet).toBeHidden()
  }
  // 書類（ES）は免除
  await step(page, 'ES').getByRole('button', { name: '編集' }).click()
  const edit = page.getByRole('dialog', { name: 'ステップを編集' })
  await edit.getByLabel('状態').selectOption('exempted')
  await edit.getByRole('button', { name: '保存' }).click()
  await expect(step(page, 'ES').getByText('免除')).toBeVisible()
  await expect(badge(page)).toHaveText('選考中')
  // 未応募のまま進んだので注意が出る（E-5）。応募状態は変わらない
  await expect(page.getByRole('region', { name: '注意' })).toContainText('選考が進んでいますが未応募です')

  await pass(page, '一次面接')
  await recordOutcome(page, '内定承諾')
  await expect(badge(page)).toHaveText('内定承諾')
  await expect(page.getByRole('region', { name: '応募状態' })).toContainText('未応募')
})

test('2-10 ゴミ箱に入れて復元し、完全に削除する', async ({ page }, testInfo) => {
  const name = `E2Eゴミ箱 ${Date.now()} ${testInfo.project.name}`
  await addCompany(page, name)
  await page.getByRole('button', { name: 'ステップを追加' }).click()
  await page.getByRole('button', { name: 'まとめて追加' }).click()
  await expect(page.getByRole('region', { name: '選考ステップ' }).getByRole('listitem')).toHaveCount(5)
  const companyUrl = page.url()

  await page.getByRole('button', { name: 'ゴミ箱に入れる' }).click()
  await page
    .getByRole('dialog', { name: 'ゴミ箱に入れますか？' })
    .getByRole('button', { name: 'ゴミ箱に入れる' })
    .click()
  await expect(page).toHaveURL(/\/companies$/)
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)

  // ゴミ箱内の企業は詳細を開いても変更できない
  await page.goto(companyUrl)
  await expect(page.getByText(/ゴミ箱に入っています/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'ステップを追加' })).toHaveCount(0)

  // 復元するとステップ・履歴も元どおり
  await page.goto('/more/trash')
  await page.getByRole('listitem', { name }).getByRole('button', { name: '復元' }).click()
  await expect(page.getByRole('listitem', { name })).toHaveCount(0)
  await page.goto(companyUrl)
  await expect(page.getByRole('region', { name: '選考ステップ' }).getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('region', { name: '履歴' })).toContainText('ゴミ箱から復元')

  // もう一度ゴミ箱に入れて、完全に削除する。その企業の履歴も消える
  await page.getByRole('button', { name: 'ゴミ箱に入れる' }).click()
  await page
    .getByRole('dialog', { name: 'ゴミ箱に入れますか？' })
    .getByRole('button', { name: 'ゴミ箱に入れる' })
    .click()
  await expect(page).toHaveURL(/\/companies$/)
  const id = companyUrl.split('/').pop()!
  await page.goto('/more/trash')
  await page.getByRole('listitem', { name }).getByRole('button', { name: '完全に削除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完全に削除する' }).click()
  await expect(page.getByRole('listitem', { name })).toHaveCount(0)
  expect(psql(`select count(*) from public.timeline_entries where company_id = '${id}'`)).toBe('0')
  expect(psql(`select count(*) from public.selection_steps where company_id = '${id}'`)).toBe('0')
})
