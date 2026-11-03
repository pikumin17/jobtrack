import { expect, test } from '@playwright/test'

// フェーズ5: ホーム画面に追加できる形（マニフェスト・アイコン・Service Worker）
test('マニフェストのアイコンが揃っていて、Service Worker が登録される', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.display).toBe('standalone')
  const icons = manifest.icons as { src: string; sizes: string; purpose: string }[]
  expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  for (const icon of icons) expect((await request.get(icon.src)).status()).toBe(200)
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200)

  await page.goto('/login')
  // e2e の型定義には DOM がないので、ブラウザの中の値として扱う
  type SwNavigator = { serviceWorker: { ready: Promise<{ scope: string }> } }
  const scope = await page.evaluate(
    async () => (await (globalThis.navigator as unknown as SwNavigator).serviceWorker.ready).scope,
  )
  expect(new URL(scope).pathname).toBe('/')
})
