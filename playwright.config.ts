import { defineConfig } from '@playwright/test'

// E2E против ИЗОЛИРОВАННОГО эфемерного стенда (compose.e2e.yaml: nginx :8081 → api :8001),
// мир создаёт scripts/seed_demo.py, снос стека — scripts/e2e.sh (down -v). Живой стенд :8080
// e2e не трогает: тесты не оставляют следов в его БД по построению.
// Запуск: npm run test:e2e (обёртка scripts/e2e.sh). Vitest — компонентный уровень.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // сценарии меняют данные e2e-стенда — строго последовательно
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    locale: 'ru-RU',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
