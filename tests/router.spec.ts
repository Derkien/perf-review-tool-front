import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/endpoints', () => ({
  postActivity: vi.fn(async () => undefined),
}))

import { createPinia, setActivePinia } from 'pinia'
import { useAuth } from '../src/stores/auth'
import router, { homeForAuth } from '../src/router'

const canAll = () => true
const canNone = () => false

describe('router guards (permissions)', () => {
  it('homeForAuth: с правом ROLE_R_DASHBOARD → /dashboard, без → /my-review', () => {
    expect(homeForAuth(canAll)).toBe('/dashboard')
    expect(homeForAuth(canNone)).toBe('/my-review')
  })

  it('employee не попадает на /dashboard — редирект на /my-review', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 1, email: 'e@x.ru', full_name: 'E', role: 'employee', roles: ['employee'],
      permissions: ['ROLE_V_EMPLOYEE_SUBORDINATE'], has_subordinates: false,
    }
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/my-review')
  })

  it('employee не попадает в /admin', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 1, email: 'e@x.ru', full_name: 'E', role: 'employee', roles: ['employee'],
      permissions: [], has_subordinates: false,
    }
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/my-review')
  })

  it('пользователь с ROLE_U_SETTINGS свободно ходит в /admin', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 2, email: 'a@x.ru', full_name: 'A', role: 'admin', roles: ['admin'],
      permissions: ['ROLE_U_SETTINGS', 'ROLE_R_DASHBOARD'], has_subordinates: true,
    }
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/admin')
  })
})
