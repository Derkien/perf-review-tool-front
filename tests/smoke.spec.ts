import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/endpoints', () => ({
  authApi: {
    config: vi.fn(async () => ({
      auth_mode: 'dev', keycloak_server_url: '', keycloak_realm: '', keycloak_client_id: '',
    })),
    devToken: vi.fn(async () => 'x'),
    me: vi.fn(async () => ({
      id: 1, email: 'a@b.c', full_name: 'A', role: 'admin', roles: ['admin'],
      permissions: ['ROLE_R_DASHBOARD'],
    })),
  },
  postActivity: vi.fn(async () => undefined),
}))

describe('SPA smoke (прод-сценарий: реальный main.ts в jsdom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    try { localStorage.clear() } catch { /* node env */ }
    vi.resetModules()
  })

  it('main.ts монтирует приложение, /login рендерит форму входа', async () => {
    location.hash = '#/login'
    await import('../src/main')
    await new Promise((r) => setTimeout(r, 100))
    const appEl = document.getElementById('app')
    expect(appEl).toBeTruthy()
    expect(appEl!.innerHTML.length, '#app не должен быть пуст (белый экран)').toBeGreaterThan(0)
    const html = appEl!.innerHTML
    expect(html).toContain('Perf Review Tool')
    expect(html).toContain('Роль')
  })

  it('с сохранённой сессией открывается приложение (не пустой #app)', async () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('me', JSON.stringify({ id: 1, email: 'a@b.c', full_name: 'A', role: 'admin' }))
    location.hash = '#/dashboard'
    await import('../src/main')
    await new Promise((r) => setTimeout(r, 100))
    const html = document.getElementById('app')!.innerHTML
    expect(html.length, '#app не должен быть пуст (белый экран)').toBeGreaterThan(0)
  })
})
