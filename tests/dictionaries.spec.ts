import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'

// мок API-слоя: справочники (грейды + категории/пункты), реестр типов, админка
vi.mock('../src/api/endpoints', () => ({
  dictionariesApi: {
    list: vi.fn(async () => [
      { slug: 'grade', title: 'Грейды', description: 'порядок = вес', items_count: 10,
        code_managed: true, has_categories: false, parent_slug: null },
      { slug: 'competency-category', title: 'Категории компетенций', description: '', items_count: 1,
        code_managed: true, has_categories: false, parent_slug: null },
      { slug: 'competency-item', title: 'Пункты компетенций', description: '', items_count: 1,
        code_managed: true, has_categories: true, parent_slug: 'competency-category' },
      { slug: 'offices', title: 'Офисы', description: '', items_count: 0,
        code_managed: false, has_categories: false, parent_slug: null },
    ]),
    items: vi.fn(async (slug: string) =>
      slug === 'grade'
        ? [{ id: 1, slug: 'stazher', value: 'Стажёр', title: 'Стажёр', order_no: 1, category: '' },
           { id: 2, slug: 'mladshiy', value: 'Младший', title: 'Младший', order_no: 2, category: '' }]
        : slug === 'competency-category'
          ? [{ id: 11, slug: 'iazyki', value: 'Языки', title: 'Языки', order_no: 1, category: '' }]
          : slug === 'offices'
            ? [{ id: 31, slug: 'moskva', value: 'Москва', title: 'Москва', order_no: 1, category: '' }]
            : [{ id: 21, slug: 'python', value: 'Python', title: 'Python', order_no: 1, category: 'Языки' }]),
    createItem: vi.fn(async () => ({ id: 99, slug: 'x', value: 'X', title: 'X', order_no: 3, category: '' })),
    patchItem: vi.fn(async () => ({ id: 1, slug: 'stazher', value: 'Стажёр', title: 'T', order_no: 1 })),
    createDictionary: vi.fn(async () => ({ slug: 'x', title: 'X' })),
    patchDictionary: vi.fn(async () => ({ slug: 'x', title: 'X' })),
    export: vi.fn(async () => new Blob(['xlsx'])),
    importPreview: vi.fn(async () => ({
      sheets: {
        'competency-category': { added: [], edited: [] },
        'competency-item': {
          added: [{ value: 'Docker', slug: '', title: 'Docker', order_no: 9, category: 'Инфраструктура' }],
          edited: [],
        },
      },
      no_changes: false,
    })),
    importApply: vi.fn(async () => ({ added: 1, edited: 0 })),
  },
  competencyTypesApi: {
    all: vi.fn(async () => []),
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

describe('AdminView: вкладка «Справочники»', () => {
  beforeEach(() => vi.clearAllMocks())

  it('скрыта без ROLE_U_COMPETENCY_MATRIX', async () => {
    setAuth(['ROLE_U_SETTINGS'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).not.toContain('Справочники')
  })

  it('видна с правом; список справочников с пометкой «в коде»', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toContain('Справочники')
    const tab = w.findComponent(DictionariesTab)
    expect(tab.exists()).toBe(true)
    expect(tab.text()).toContain('Грейды')
    expect(tab.text()).toContain('в коде')
  })
})

describe('DictionariesTab: значения и словарные операции', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
    // confirm-диалог в тестах не смонтирован: освобождаем синглтон после прошлых тестов
    const { _release } = await import('../src/composables/useAppConfirm')
    _release()
  })

  it('список справочников фильтруется поиском по названию и слагу', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    expect(w.text()).toContain('Грейды')
    vm.search = 'грейд'
    await settle()
    expect(vm.filteredDictionaries.map((d: any) => d.slug)).toEqual(['grade'])
    vm.search = 'offices'
    await settle()
    expect(vm.filteredDictionaries.map((d: any) => d.slug)).toEqual(['offices'])
  })

  it('глобальный поиск: значения всех справочников + переход к справочнику', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.search = 'python'
    await settle(50)
    // значения всех справочников запрошены (лениво, один раз)
    expect(dictionariesApi.items).toHaveBeenCalledWith('grade')
    expect(dictionariesApi.items).toHaveBeenCalledWith('competency-item')
    expect(vm.globalMatches.length).toBe(1)
    expect(vm.globalMatches[0].dictSlug).toBe('competency-item')
    await vm.gotoDict('competency-item')
    await settle()
    expect(vm.selectedSlug).toBe('competency-item')
    expect(w.text()).toContain('Python')
  })

  it('drill-down: значения справочника с локальным поиском по слагу/значению', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.gotoDict('grade')
    await settle()
    expect(w.text()).toContain('Стажёр')
    vm.search = 'mladshiy'
    await settle()
    expect(vm.filteredItems.map((i: any) => i.value)).toEqual(['Младший'])
    vm.search = 'стаж'
    await settle()
    expect(vm.filteredItems.map((i: any) => i.value)).toEqual(['Стажёр'])
  })

  it('добавление значения → уходящий POST с телом выбранного справочника', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.gotoDict('grade')
    await settle()
    vm.itemIsNew = true
    vm.itemForm = { id: 0, value: 'Ключевой 3', slug: 'klyuchevoy-3', origSlug: '',
                    title: 'Ключевой 3', order: 11, category: '' }
    vm.itemOrderStr = '11'
    await vm.saveItem()
    await settle()
    expect(dictionariesApi.createItem).toHaveBeenCalledWith('grade', {
      value: 'Ключевой 3', title: 'Ключевой 3', order_no: 11, category: '',
      slug: 'klyuchevoy-3',
    })
  })

  it('создание справочника вручную → POST /dictionaries', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.dictIsNew = true
    vm.dictForm = { slug: 'timezones', title: 'Часовые пояса', description: '', origSlug: '', codeManaged: false }
    await vm.saveDict()
    await settle()
    expect(dictionariesApi.createDictionary).toHaveBeenCalledWith({
      slug: 'timezones', title: 'Часовые пояса', description: '',
    })
  })

  it('слаг справочника необязателен: пустой уходит на сервер (автотранслит там, приёмка 16.11)', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.dictIsNew = true
    vm.dictForm = { slug: '', title: 'Часовые пояса', description: '', origSlug: '', codeManaged: false }
    await vm.saveDict()
    await settle()
    expect(dictionariesApi.createDictionary).toHaveBeenCalledWith({
      slug: '', title: 'Часовые пояса', description: '',
    })
  })

  it('предпросмотр апсерта: новый справочник из файла виден как «НОВЫЙ справочник»', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.diff = {
      no_changes: false,
      sheets: {
        timezones: { added: [{ value: 'UTC+3', slug: '', title: 'UTC+3', order_no: 1, category: '' }], edited: [], new: true },
        grade: { added: [], edited: [], new: false },
      },
    }
    vm.diffVisible = true
    await settle()
    expect(w.text()).toContain('НОВЫЙ справочник')
    expect(w.text()).toContain('timezones')
    expect(w.text()).toContain('будет создан целиком')
  })

  it('правка порядка грейда — подтверждение через useAppConfirm, затем PATCH', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.gotoDict('grade')
    await settle()
    vm.itemIsNew = false
    vm.itemForm = { id: 1, value: 'Стажёр', slug: 'stazher', origSlug: 'stazher',
                    title: 'Стажёр', order: 1, category: '' }
    vm.itemOrderStr = '12'
    const saving = vm.saveItem()   // без await: висит на ask() до подтверждения
    await settle()
    expect(dictionariesApi.patchItem).not.toHaveBeenCalled()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('вес грейда')
    useAppConfirm().state.value?.resolve('')
    await saving
    await settle()
    expect(dictionariesApi.patchItem).toHaveBeenCalledWith('grade', 1,
      { title: 'Стажёр', order_no: 12 })
  })

  it('смена слага значения (не код-зарегистрированный справочник) — гвард подтверждения, PATCH со слагом', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.gotoDict('offices')
    await settle()
    vm.itemIsNew = false
    vm.itemForm = { id: 31, value: 'Москва', slug: 'moscow', origSlug: 'moskva',
                    title: 'Москва', order: 1, category: '' }
    vm.itemOrderStr = '1'
    const saving = vm.saveItem()
    await settle()
    expect(dictionariesApi.patchItem).not.toHaveBeenCalled()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('слаг значения')
    expect(useAppConfirm().state.value?.message).toContain('разработчику')
    useAppConfirm().state.value?.resolve('')
    await saving
    await settle()
    expect(dictionariesApi.patchItem).toHaveBeenCalledWith('offices', 31,
      { title: 'Москва', order_no: 1, slug: 'moscow' })
  })

  it('код-зарегистрированный справочник: смена слага значения не отправляется (поле заблокировано)', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.gotoDict('grade')
    await settle()
    expect(vm.isCodeManaged).toBe(true)
    vm.itemIsNew = false
    // даже если слаг как-то изменён — гвард не предлагается, slug не уходит
    vm.itemForm = { id: 1, value: 'Стажёр', slug: 'hacked', origSlug: 'stazher',
                    title: 'Стажёр', order: 1, category: '' }
    vm.itemOrderStr = '1'
    await vm.saveItem()
    await settle()
    const call = (dictionariesApi.patchItem as any).mock.calls[0]
    expect(call[2].slug).toBeUndefined()
  })

  it('смена слага справочника — гвард подтверждения, PATCH с новым слагом', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.dictIsNew = false
    vm.dictForm = { slug: 'office-list', title: 'Офисы', description: '', origSlug: 'offices', codeManaged: false }
    const saving = vm.saveDict()
    await settle()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('слаг справочника')
    useAppConfirm().state.value?.resolve('')
    await saving
    await settle()
    expect(dictionariesApi.patchDictionary).toHaveBeenCalledWith('offices', {
      title: 'Офисы', description: '', slug: 'office-list',
    })
  })

  it('выгрузка: все словари и один справочник', async () => {
    const w = mount(DictionariesTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    await vm.downloadExport()
    await settle()
    expect(dictionariesApi.export).toHaveBeenCalledWith(undefined)
    await vm.downloadExport('grade')
    await settle()
    expect(dictionariesApi.export).toHaveBeenCalledWith('grade')
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
