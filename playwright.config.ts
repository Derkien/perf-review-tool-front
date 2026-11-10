import { defineConfig } from '@playwright/test'

// E2E против живого стенда docker compose (nginx :8080 → api :8000).
// Vitest остаётся для компонентного уровня — здесь только сквозные сценарии.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // сценарии меняют данные стенда — строго последовательно
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    locale: 'ru-RU',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
