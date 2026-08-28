import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api', () => ({
  api: {
    get: vi.fn(async () => ({ data: { auth_mode: 'dev' } })),
    post: vi.fn(async () => ({ data: { access_token: 'x' } })),
  },
  errMsg: (e: unknown) => String(e),
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
