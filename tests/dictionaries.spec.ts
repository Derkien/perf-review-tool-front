import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'

// мок API-слоя: справочники (грейды + категории/пункты), реестр типов, админка
vi.mock('../src/api/endpoints', () => ({
  dictionariesApi: {
    list: vi.fn(async () => [
      { slug: 'grade', title: 'Грейды', description: 'порядок = вес', items_count: 10 },
      { slug: 'competency-category', title: 'Категории компетенций', description: '', items_count: 1 },
      { slug: 'competency-item', title: 'Пункты компетенций', description: '', items_count: 1 },
    ]),
    items: vi.fn(async (slug: string) =>
      slug === 'grade'
        ? [{ id: 1, value: 'Стажёр', title: 'Стажёр', order_no: 1, category: '' },
           { id: 2, value: 'Младший', title: 'Младший', order_no: 2, category: '' }]
        : slug === 'competency-category'
          ? [{ id: 11, value: 'Языки', title: 'Языки', order_no: 1, category: '' }]
          : [{ id: 21, value: 'Python', title: 'Python', order_no: 1, category: 'Языки' }]),
    createItem: vi.fn(async () => ({ id: 99, value: 'X', title: 'X', order_no: 3, category: '' })),
    patchItem: vi.fn(async () => ({ id: 1, value: 'Стажёр', title: 'T', order_no: 1 })),
    export: vi.fn(async () => new Blob(['xlsx'])),
    importPreview: vi.fn(async () => ({
      sheets: {
        'competency-category': { added: [], edited: [] },
        'competency-item': {
          added: [{ value: 'Docker', title: 'Docker', order_no: 9, category: 'Инфраструктура' }],
          edited: [],
        },
      },
      no_changes: false,
    })),
    importApply: vi.fn(async () => ({ added: 1, edited: 0 })),
  },
  competencyTypesApi: {
    all: vi.fn(async () => [
      { code: 'hard', title: 'Харды', order_no: 1, is_active: true },
      { code: 'soft', title: 'Софты', order_no: 2, is_active: true },
    ]),
  },
  adminApi: {
    users: vi.fn(async () => []),
    settings: vi.fn(async () => ({
      autocalibration_weights: {}, raise_rules: {}, leader_assessment: {},
      workflow_gates: {}, delegation: {},
    })),
    permissionsCatalog: vi.fn(async () => ({ roles: [], superuser_role: 'admin', permissions: [], matrix: {} })),
    activity: vi.fn(async () => []),
    audit: vi.fn(async () => []),
  },
  reviewsApi: { workflowSchema: vi.fn(async () => ({ places: [], transitions: [] })) },
  notificationsApi: { unreadCount: vi.fn(async () => ({ count: 0 })) },
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String((e as Error)?.message || e),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/admin' }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import AdminView from '../src/views/AdminView.vue'
import DictionariesTab from '../src/components/DictionariesTab.vue'
import { dictionariesApi } from '../src/api/endpoints'
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

describe('AdminView: вкладка «Справочники» (5.1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('скрыта без ROLE_U_COMPETENCY_MATRIX', async () => {
    setAuth(['ROLE_U_SETTINGS'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).not.toContain('Справочники')
  })

  it('видна с правом; значения выбранного справочника из API', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toContain('Справочники')
    const tab = w.findComponent(DictionariesTab)
    expect(tab.exists()).toBe(true)
    expect(tab.text()).toContain('Стажёр')           // дефолтный первый справочник — грейды
    expect(tab.text()).toContain('порядок = вес')     // описание справочника
  })
})

describe('DictionariesTab: значения и словарные операции (5.1/5.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  it('добавление значения → уходящий POST с телом выбранного справочника', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.itemIsNew = true
    vm.itemForm = { id: 0, value: 'Ключевой 3', title: 'Ключевой 3', order: 11, category: '' }
    vm.itemOrderStr = '11'
    await vm.saveItem()
    await settle()
    expect(dictionariesApi.createItem).toHaveBeenCalledWith('grade', {
      value: 'Ключевой 3', title: 'Ключевой 3', order_no: 11, category: '',
    })
  })

  it('правка порядка грейда — подтверждение через useAppConfirm, затем PATCH', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.itemIsNew = false
    vm.itemForm = { id: 1, value: 'Стажёр', title: 'Стажёр', order: 1, category: '' }
    vm.itemOrderStr = '12'
    const saving = vm.saveItem()   // без await: висит на ask() до подтверждения
    await settle()
    expect(dictionariesApi.patchItem).not.toHaveBeenCalled()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('вес грейда')
    useAppConfirm().state.value?.resolve('')
    await saving
    await settle()
    expect(dictionariesApi.patchItem).toHaveBeenCalledWith('grade', 1, { title: 'Стажёр', order_no: 12 })
  })

  it('выгрузка: клик → export с выбранными типами', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.exportTypes = ['hard']
    await vm.downloadExport()
    await settle()
    expect(dictionariesApi.export).toHaveBeenCalledWith(['hard'])
  })

  it('импорт диффа: файл → предпросмотр с новыми значениями → apply того же файла', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.file = new File(['x'], 'dictionaries.xlsx')
    await vm.previewImport()
    await settle()
    expect(dictionariesApi.importPreview).toHaveBeenCalled()
    expect(vm.diffVisible).toBe(true)
    expect(w.text()).toContain('+ Docker')            // новое значение в предпросмотре
    await vm.applyImport()
    await settle()
    expect(dictionariesApi.importApply).toHaveBeenCalled()
    expect(vm.diffVisible).toBe(false)
  })
})
