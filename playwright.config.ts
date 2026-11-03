// E2E テスト（設計書 04 フェーズ2、N-7）。CI の中で起動したローカルの Supabase だけを使う。本番には接続しない。
// 必要な環境変数（`supabase status -o env` の値）: E2E_API_URL, E2E_ANON_KEY, E2E_SERVICE_ROLE_KEY, E2E_DB_URL
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // ローカルの Supabase に向けてビルドしたアプリを配信する
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_API_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_ANON_KEY ?? '',
    },
  },
})
