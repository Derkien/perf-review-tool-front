import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'

const pushMock = vi.hoisted(() => vi.fn())
const replaceMock = vi.hoisted(() => vi.fn())
// без reactive: тесты меняют params ДО mount — чтения в computed хватает
const routeState = vi.hoisted(() => ({ params: {} as Record<string, string> }))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))
vi.mock('../src/api/endpoints', () => ({
  adminApi: {
    users: vi.fn(async () => []),
    settings: vi.fn(async () => ({
      autocalibration_weights: {}, raise_rules: {}, leader_assessment: {},
      workflow_gates: {}, delegation: {}, competency_reassessment: {},
    })),
    permissionsCatalog: vi.fn(async () => ({ roles: [], superuser_role: 'admin', permissions: [], matrix: {} })),
    activity: vi.fn(async () => []),
    audit: vi.fn(async () => []),
  },
  reviewsApi: { workflowSchema: vi.fn(async () => ({ places: [], transitions: [] })) },
  notificationsApi: { unreadCount: vi.fn(async () => ({ count: 0 })) },
  competenciesApi: { schemas: vi.fn(async () => ({ groups: [], roles_without_schemas: [] })) },
  competencyTypesApi: { all: vi.fn(async () => []) },
  dictionariesApi: {
    list: vi.fn(async () => []),
    items: vi.fn(async () => []),
    importPreview: vi.fn(),
    importApply: vi.fn(),
    export: vi.fn(),
    createItem: vi.fn(), patchItem: vi.fn(),
    createDictionary: vi.fn(), patchDictionary: vi.fn(),
  },
  assignmentsApi: {},
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String(e),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import AdminView from '../src/views/AdminView.vue'
import { useAuth } from '../src/stores/auth'

async function settle(ms = 20) {
  await new Promise((r) => setTimeout(r, ms))
}

function setAuth(perms: string[]) {
  setActivePinia(createPinia())
  const auth = useAuth()
  auth.me = {
    id: 1, email: 'a@x.ru', full_name: 'A', role: 'admin', roles: ['admin'],
    permissions: perms, has_subordinates: true,
  } as any
  return auth
}

describe('AdminView: подразделы — URL-роуты (приёмка 16.11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.params = {}
  })

  it('дефолт — /admin/users; клик по вкладке ведёт роутом /admin/<section>', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    const tabs = w.findAll('[role="tab"]')
    const dicts = tabs.find((t) => t.text() === 'Справочники')!
    await dicts.trigger('click')
    await settle()
    expect(pushMock).toHaveBeenCalledWith('/admin/dictionaries')
  })

  it('URL восстанавливает раздел: ?section=dictionaries открывает «Справочники»', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    routeState.params = { section: 'dictionaries' }
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    const selected = w.findAll('[role="tab"]').find((t) => t.attributes('aria-selected') === 'true')
    expect(selected?.text()).toBe('Справочники')
  })

  it('раздел без права в URL заменяется первым доступным (replace на честный путь)', async () => {
    setAuth(['ROLE_U_SETTINGS'])  // нет ROLE_U_COMPETENCY_MATRIX
    routeState.params = { section: 'dictionaries' }
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).not.toContain('Справочники')
    expect(replaceMock).toHaveBeenCalledWith('/admin/users')
  })
})
