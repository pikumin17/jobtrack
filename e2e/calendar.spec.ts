import { expect, test } from '@playwright/test'
import { USERS } from './support'

// フェーズ3（前半）: 予定・タスクの追加、カレンダーへの表示、完了、ホームの要対応・優先タスク、利用者間の分離
test.use({ storageState: USERS.a.state })

// JST の今日（テストはブラウザも Asia/Tokyo で動かす）
const todayJst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

test('企業の詳細から予定とタスクを追加し、カレンダーとホームに出て、完了できる', async ({ page }, testInfo) => {
  const suffix = `${Date.now()} ${testInfo.project.name}`
  const companyName = `E2E予定 ${suffix}`
  const eventTitle = `E2E説明会 ${suffix}`
  const taskTitle = `E2E逆質問 ${suffix}`
  const today = todayJst()

  await page.goto('/companies')
  await page.getByLabel('企業名', { exact: true }).fill(companyName)
  await page.getByRole('button', { name: '追加' }).click()
  await page.getByRole('link', { name: new RegExp(companyName) }).click()

  // 予定（今日の 23:00、企業に紐付け）
  const plans = page.getByRole('region', { name: '予定・タスク' })
  await plans.getByRole('button', { name: '予定を追加' }).click()
  const eventSheet = page.getByRole('dialog', { name: '予定を追加' })
  await eventSheet.getByLabel('名前').fill(eventTitle)
  await eventSheet.getByLabel('開始日時').fill(`${today}T23:00`)
  await eventSheet.getByRole('button', { name: '保存' }).click()
  await expect(eventSheet).toBeHidden()
  await expect(plans.getByRole('listitem', { name: new RegExp(eventTitle) })).toBeVisible()

  // 優先度「高」、期日が今日のタスク
  await plans.getByRole('button', { name: 'タスクを追加' }).click()
  const taskSheet = page.getByRole('dialog', { name: 'タスクを追加' })
  await taskSheet.getByLabel('やること').fill(taskTitle)
  await taskSheet.getByLabel('優先度').selectOption('1')
  await taskSheet.getByRole('radio', { name: '日付だけ' }).check()
  await taskSheet.getByLabel('期日').fill(today)
  await taskSheet.getByRole('button', { name: '保存' }).click()
  await expect(taskSheet).toBeHidden()

  // 企業の履歴にも残る
  await expect(page.getByRole('region', { name: '履歴' })).toContainText(`予定を追加: ${eventTitle}`)

  // ホーム: 今日までのタスクは要対応（今日まで）、優先タスクにも出る。予定は直近の予定に出る
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: /要対応/ }).getByRole('listitem', { name: new RegExp(taskTitle) }),
  ).toContainText('今日まで')
  await expect(page.getByRole('region', { name: '優先タスク' })).toContainText(taskTitle)
  await expect(page.getByRole('region', { name: /直近の予定/ })).toContainText(eventTitle)

  // カレンダー: 今日を選んだ状態で両方が出る。タスクを完了すると、再読み込み後も完了のまま
  await page.goto('/calendar')
  const day = page.getByRole('region', { name: /\d{4}\/\d{2}\/\d{2}/ })
  await expect(day.getByRole('listitem', { name: new RegExp(eventTitle) })).toContainText(companyName)
  // チェックの名前は状態によらず同じ。状態は「チェック済みかどうか」で伝える
  const done = day.getByRole('checkbox', { name: `${taskTitle}（完了）` })
  await expect(done).not.toBeChecked()
  await done.click()
  await expect(done).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: `${taskTitle}（完了）` })).toBeChecked()

  // 完了したタスクはホームの要対応・優先タスクから消える
  await page.goto('/')
  await expect(page.getByRole('region', { name: /直近の予定/ })).toContainText(eventTitle)
  await expect(page.getByRole('region', { name: /要対応/ }).getByText(taskTitle)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '優先タスク' }).getByText(taskTitle)).toHaveCount(0)

  // 予定を編集して削除する
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'これから' }).click()
  await page.getByRole('button', { name: eventTitle }).click()
  const editSheet = page.getByRole('dialog', { name: '予定を編集' })
  await editSheet.getByRole('button', { name: '削除', exact: true }).click()
  await editSheet.getByRole('button', { name: '削除する' }).click()
  await expect(editSheet).toBeHidden()
  await expect(page.getByText(eventTitle)).toHaveCount(0)
})

test('期日のないタスクはタスクの一覧に出て、ほかの利用者からは見えない', async ({ page, browser }, testInfo) => {
  const taskTitle = `E2E期日なし ${Date.now()} ${testInfo.project.name}`
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'タスクを追加' }).click()
  const sheet = page.getByRole('dialog', { name: 'タスクを追加' })
  await sheet.getByLabel('やること').fill(taskTitle)
  await sheet.getByRole('button', { name: '保存' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'タスク', exact: true }).click()
  await expect(page.getByRole('listitem', { name: new RegExp(taskTitle) })).toContainText('期日なし')

  // B のカレンダー・タスクには出ない（S-11）
  const other = await browser.newContext({ storageState: USERS.b.state })
  const pageB = await other.newPage()
  await pageB.goto('/calendar')
  await pageB.getByRole('button', { name: 'タスク', exact: true }).click()
  await expect(pageB.getByRole('region', { name: 'タスク' })).toBeVisible()
  await expect(pageB.getByText(taskTitle)).toHaveCount(0)
  await other.close()
})
