import { expect, test } from '@playwright/test'
import { USERS } from './support'

// ステップの一括追加・簡単操作・並替・結果の記録が、再読み込み後も残り、選考状態に反映される
test.use({ storageState: USERS.a.state })

test('よくある流れを追加して進め、結果を記録する', async ({ page }, testInfo) => {
  const companyName = `E2Eステップ ${Date.now()} ${testInfo.project.name}`
  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(companyName)
  await page.getByRole('button', { name: '追加' }).click()
  await page.getByRole('link', { name: new RegExp(companyName) }).click()

  await page.getByRole('button', { name: 'ステップを追加' }).click()
  await page.getByRole('button', { name: 'まとめて追加' }).click()
  const steps = page.getByRole('region', { name: '選考ステップ' }).getByRole('listitem')
  await expect(steps).toHaveCount(5)
  await expect(steps.nth(0)).toHaveAccessibleName('ES')
  await expect(steps.nth(4)).toHaveAccessibleName('最終面接')
  // 全ステップ未着手は「選考前」なので、未応募のバッジのまま
  await expect(page.getByTestId('status-badge').getByText('未応募')).toBeVisible()

  // ES を提出 → 結果待ち → 通過。選考中になる
  const es = page.getByRole('listitem', { name: 'ES', exact: true })
  await es.getByRole('button', { name: '提出した／受けた' }).click()
  await expect(es.getByText('結果待ち')).toBeVisible()
  await expect(page.getByRole('region', { name: '結果待ち' })).toContainText('ES（0日経過）')
  await expect(page.getByTestId('status-badge').getByText('選考中')).toBeVisible()
  await es.getByRole('button', { name: '通過' }).click()
  await expect(es.getByText('通過', { exact: true })).toBeVisible()

  // Webテストを一番下へ（並替）
  for (const index of [2, 3, 4]) {
    await page.getByRole('button', { name: 'Webテストを下へ' }).click()
    await expect(steps.nth(index)).toHaveAccessibleName('Webテスト')
  }
  await expect(page.getByRole('button', { name: 'Webテストを下へ' })).toBeDisabled()

  // 一次面接を不合格 → 不合格。結果を内定と記録すると記録が優先される
  await page
    .getByRole('listitem', { name: '一次面接', exact: true })
    .getByRole('button', { name: '提出した／受けた' })
    .click()
  await page.getByRole('listitem', { name: '一次面接', exact: true }).getByRole('button', { name: '不合格' }).click()
  await expect(page.getByTestId('status-badge').getByText('不合格')).toBeVisible()
  await page.getByRole('button', { name: '結果を記録' }).click()
  const sheet = page.getByRole('dialog', { name: '結果を記録' })
  await sheet.getByRole('radio', { name: '内定', exact: true }).click()
  await sheet.getByRole('button', { name: '記録する' }).click()
  await expect(sheet).toBeHidden()

  await page.reload()
  await expect(page.getByTestId('status-badge').getByText('内定')).toBeVisible()
  await expect(steps).toHaveCount(5)
  await expect(steps.nth(4)).toHaveAccessibleName('Webテスト')
  // 応募状態はステップを進めても変わらない（2-14）
  await expect(page.getByRole('region', { name: '応募状態' }).getByText('未応募')).toBeVisible()
})
