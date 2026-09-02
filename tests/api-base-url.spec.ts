import { describe, expect, it, vi, beforeEach } from 'vitest'

/** Регрессия бага «Unexpected token '<'» на :8080: клиент обязан ходить через
 *  /api/v1 (префикс снят из схемы codegen-скриптом; nginx проксирует только /api/,
 *  остальные пути отдают index.html). Проверяем РЕАЛЬНЫЙ client + endpoints
 *  с подменённым fetch; абсолютная база в тесте — из-за node Request (в браузере
 *  база относительная, контракт префикса тот же). */

const FETCH_BASE = 'http://localhost:8080'
const fetchCalls: string[] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  // openapi-fetch передаёт в fetch объект Request — берём его url
  fetchCalls.push(input instanceof Request ? input.url : String(input))
  return new Response(JSON.stringify({ auth_mode: 'dev' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
})

/** Свежий импорт слоя с заданным env (модуль читает VITE_API_BASE при инициализации). */
async function importApiLayer(env?: string) {
  if (env === undefined) vi.unstubAllEnvs()
  else vi.stubEnv('VITE_API_BASE', env)
  vi.stubGlobal('fetch', fetchMock)
  return import('../src/api/endpoints')
}

describe('API base URL: все запросы через /api/v1', () => {
  beforeEach(() => {
    fetchCalls.length = 0
    vi.resetModules()
  })

  it('без env база по умолчанию — /api/v1 (относительная, работает за nginx/vite-прокси)', async () => {
    vi.unstubAllEnvs()
    const { API_BASE } = await import('../src/api/client')
    expect(API_BASE).toBe('/api/v1')
  })

  it('authApi.config ходит на <база>/api/v1/auth/config, а не в корень (SPA-фолбэк nginx)', async () => {
    const { authApi } = await importApiLayer(`${FETCH_BASE}/api/v1`)
    await authApi.config()
    expect(fetchCalls[0]).toBe(`${FETCH_BASE}/api/v1/auth/config`)
  })

  it('path-параметры собираются в полный URL с префиксом', async () => {
    const { staffApi } = await importApiLayer(`${FETCH_BASE}/api/v1`)
    await staffApi.card(33)
    expect(fetchCalls.at(-1)).toBe(`${FETCH_BASE}/api/v1/staff/employees/33`)
  })

  it('клиент не отправляет запросы на пути без /api/v1 (иначе nginx вернёт HTML)', async () => {
    const { authApi, reviewsApi } = await importApiLayer(`${FETCH_BASE}/api/v1`)
    await authApi.config()
    await reviewsApi.cycles()
    expect(fetchCalls.length).toBeGreaterThanOrEqual(2)
    for (const url of fetchCalls) {
      expect(url.startsWith(`${FETCH_BASE}/api/v1/`), `URL без префикса: ${url}`).toBe(true)
    }
  })
})
