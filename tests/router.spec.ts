import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/endpoints', () => ({
  postActivity: vi.fn(async () => undefined),
}))

// перехват регистрации: регрессия бага «401 без редиректа» — хендлер обязан быть установлен
const unauthorizedHandler = vi.hoisted(() => vi.fn())
vi.mock('../src/api/client', () => ({
  setUnauthorizedHandler: (fn: () => void) => { unauthorizedHandler.mockImplementation(fn) },
  client: { GET: vi.fn(), POST: vi.fn() },
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

describe('router guards: массив пермишенов /admin (competency-matrix)', () => {
  it('владелец только ROLE_U_COMPETENCY_MATRIX попадает в /admin', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 3, email: 'm@x.ru', full_name: 'M', role: 'admin', roles: ['admin'],
      permissions: ['ROLE_U_COMPETENCY_MATRIX', 'ROLE_R_DASHBOARD'], has_subordinates: false,
    }
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/admin')
  })

  it('есть права, но ни одного из массива /admin — редирект', async () => {
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 4, email: 'l@x.ru', full_name: 'L', role: 'line-manager', roles: ['line-manager'],
      permissions: ['ROLE_R_DASHBOARD'], has_subordinates: true,
    }
    await router.push('/my-review')  // уходим с /admin, иначе guard не сработает
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})

describe('router: 401 от API — редирект на /login', () => {
  it('хендлер протухания зарегистрирован и ведёт на /login (регрессия: не был зарегистрирован — только тосты)', async () => {
    expect(unauthorizedHandler.getMockImplementation()).toBeTypeOf('function')

    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 5, email: 't@x.ru', full_name: 'T', role: 'employee', roles: ['employee'],
      permissions: ['ROLE_R_DASHBOARD'], has_subordinates: false,
    }
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/dashboard')

    unauthorizedHandler.mock.calls.length = 0
    unauthorizedHandler()  // клиент дропнул сессию и позвал хендлер
    // push асинхронен (lazy-компонент логина + guard) — даём навигации завершиться
    await new Promise((resolve) => setTimeout(resolve, 50))
    await router.isReady()
    expect(auth.me).toBeNull()          // стор сброшен — guard пустит на /login
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
