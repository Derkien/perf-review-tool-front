import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/http', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errMsg: (e: unknown) => String(e),
}))

import { createPinia, setActivePinia } from 'pinia'
import { useAuth } from '../src/stores/auth'
import router, { homeForRole } from '../src/router'

describe('router guards', () => {
  it('homeForRole: employee → /my-review, managers → /dashboard', () => {
    expect(homeForRole('employee')).toBe('/my-review')
    expect(homeForRole('admin')).toBe('/dashboard')
    expect(homeForRole('line-manager')).toBe('/dashboard')
  })

  it('employee не попадает на /dashboard — редирект на /my-review', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = { id: 1, email: 'e@x.ru', full_name: 'E', role: 'employee' }
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/my-review')
  })

  it('employee не попадает в /admin', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = { id: 1, email: 'e@x.ru', full_name: 'E', role: 'employee' }
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/my-review')
  })

  it('admin свободно ходит в /admin', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = { id: 2, email: 'a@x.ru', full_name: 'A', role: 'admin' }
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/admin')
  })
})
