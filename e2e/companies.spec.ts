import { expect, test } from '@playwright/test'
import { psql, USERS } from './support'

// 企業の登録 → 応募済みにする → 志望度 → 企業情報の編集 → 再読み込みしても残る。別の利用者からは見えない
test.describe('企業の登録と編集', () => {
  const name = `E2E企業 ${Date.now()}`

  test.use({ storageState: USERS.a.state })

  test('登録した企業を詳細で編集でき、別の利用者からは見えない', async ({ page, browser }, testInfo) => {
    const companyName = `${name} ${testInfo.project.name}`
    await page.goto('/companies')
    await page.getByLabel('企業名').fill(companyName)
    await page.getByRole('button', { name: '追加' }).click()
    const row = page.getByRole('link', { name: new RegExp(companyName) })
    await expect(row).toContainText('未応募')
    await expect(row).toContainText('志望度 未設定')

    await row.click()
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible()
    const companyUrl = page.url()

    // 応募済みにする（初期値は JST の今日）
    await page.getByRole('button', { name: '応募済みにする' }).click()
    const sheet = page.getByRole('dialog', { name: '応募済みにする' })
    await sheet.getByLabel('応募日').fill('2026-10-01')
    await sheet.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('応募済み 10/1(木)')).toBeVisible()

    // 志望度
    await page.getByRole('button', { name: '志望度 4 本命候補' }).click()
    await expect(page.getByRole('button', { name: '志望度 4 本命候補' })).toHaveAttribute('aria-pressed', 'true')

    // 企業情報（javascript: の URL は保存できない）
    await page.getByRole('button', { name: '編集' }).click()
    const form = page.getByRole('dialog', { name: '企業情報を編集' })
    await form.getByLabel('採用ページ').fill('javascript:alert(1)')
    await form.getByRole('button', { name: '保存' }).click()
    await expect(form.getByText('採用ページは http:// か https:// で始まるURLを入力してください')).toBeVisible()
    await form.getByLabel('採用ページ').fill('https://example.com/recruit')
    await form.getByLabel('職種').fill('企画職')
    await form.getByRole('button', { name: '保存' }).click()
    await expect(form).toBeHidden()

    await page.reload()
    await expect(page.getByText('応募済み 10/1(木)')).toBeVisible()
    await expect(page.getByText('4 本命候補')).toBeVisible()
    await expect(page.getByText('企画職')).toBeVisible()
    await expect(page.getByRole('link', { name: 'https://example.com/recruit' })).toBeVisible()

    // 履歴は DB のトリガーが書く（画面は後続の PR）。作成・応募・志望度・企業情報の4件
    const actions = psql(
      `select string_agg(t.action, ',' order by t.occurred_at, t.id) from public.timeline_entries t
         join public.companies c on c.id = t.company_id where c.name = '${companyName}'`,
    )
    expect(actions.split(',').sort()).toEqual(['application_changed', 'created', 'preference_changed', 'updated'])

    // 別の利用者（B）からは、一覧にも出ず、URL を直接開いても見つからない
    const other = await browser.newContext({ storageState: USERS.b.state })
    const otherPage = await other.newPage()
    await otherPage.goto('/companies')
    await expect(otherPage.getByRole('heading', { name: '企業' })).toBeVisible()
    await expect(otherPage.getByText(companyName)).toHaveCount(0)
    await otherPage.goto(companyUrl)
    await expect(otherPage.getByText('企業が見つかりません')).toBeVisible()
    await other.close()
  })
})
