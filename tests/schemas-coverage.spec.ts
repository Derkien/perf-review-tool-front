import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../src/api/endpoints', () => ({
  competenciesApi: {
    schemasCoverage: vi.fn(async () => [
      { type_code: 'hard', specialty: 'backend', status: 'active', active_version: 2,
        versions_count: 3, items_count: 25, updated_at: '2026-11-01T10:00:00', excluded: false },
      { type_code: 'hard', specialty: 'qa', status: 'missing', active_version: null,
        versions_count: 0, items_count: 0, updated_at: null, excluded: false },
      { type_code: 'soft', specialty: 'Разработчик бэкенд', status: 'excluded',
        active_version: 1, versions_count: 1, items_count: 8,
        updated_at: '2026-10-01T10:00:00', excluded: true },
    ]),
    coverageExport: vi.fn(async () => new Blob(['xlsx'])),
    coverageExclude: vi.fn(async () => ({ excluded: [] })),
    coverageInclude: vi.fn(async () => ({ excluded: [] })),
  },
  trackAction: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/admin' }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import SchemasCoverageTab from '../src/components/SchemasCoverageTab.vue'
import { competenciesApi } from '../src/api/endpoints'

async function settle(ms = 20) {
  await new Promise((r) => setTimeout(r, ms))
}

describe('SchemasCoverageTab: таблица покрытия и масс-действия', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    // confirm-диалог не смонтирован в тестах: освобождаем синглтон между тестами
    const { _release } = await import('../src/composables/useAppConfirm')
    _release()
    URL.createObjectURL = (() => 'blob:x') as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL
    // jsdom: нативный a.click() рвёт документ «навигацией» — стабаем скачивание
    ;(HTMLAnchorElement.prototype as any).click = () => undefined
  })

  it('строки всех статусов из API; фильтр по статусу сужает', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.text()).toContain('backend')
    expect(w.text()).toContain('активна')
    expect(w.text()).toContain('нет схемы')
    expect(w.text()).toContain('исключена')
    const vm: any = w.vm
    expect(vm.filtered.length).toBe(3)
    vm.statusFilter = 'missing'
    await settle()
    expect(vm.filtered.map((r: any) => r.specialty)).toEqual(['qa'])
  })

  it('масс-выгрузка: выбор → клик → уходящий запрос с парами выборки', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.selection = vm.withKeys.filter((r: any) => r.status !== 'excluded')
    await settle()
    expect(w.find('.mass-bar').exists()).toBe(true)  // единая плавающая панель MassActionBar
    await vm.exportSelected()
    await settle()
    expect(competenciesApi.coverageExport).toHaveBeenCalledWith(['hard:backend', 'hard:qa'])
  })

  it('исключение: подтверждение с парами → POST exclude только не-исключённых; отмена — нет запроса', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.selection = vm.withKeys.slice(0, 2)
    await settle()
    const saving = vm.excludeSelected()
    await settle()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('Исключить из квалификации')
    expect(useAppConfirm().state.value?.message).toContain('hard: backend')
    useAppConfirm().state.value?.resolve('')   // подтверждение
    ;(await import('../src/composables/useAppConfirm'))._release()  // диалог закрылся
    await saving
    await settle()
    expect(competenciesApi.coverageExclude).toHaveBeenCalledWith(['hard:backend', 'hard:qa'])

    // отмена: запрос не уходит
    vm.selection = vm.withKeys.slice(0, 1)
    const cancelled = vm.excludeSelected()
    await settle()
    useAppConfirm().state.value?.resolve(null) // отмена
    ;(await import('../src/composables/useAppConfirm'))._release()
    await cancelled
    await settle()
    expect(competenciesApi.coverageExclude).toHaveBeenCalledTimes(1)
  })


  it('единый фреймворк таблиц: MassActionBar-попап, фильтры с очисткой и сбросом, пагинатор', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    // масс-действия — единая плавающая панель (тот же MassActionBar, что у сотрудников)
    const vm: any = w.vm
    vm.selection = vm.withKeys.slice(0, 1)
    await settle()
    expect(w.find('.mass-bar').exists()).toBe(true)
    expect(w.find('.mass-bar [data-testid="coverage-export-btn"]').exists()).toBe(true)

    // фильтры: селекты с placeholder «все …» и очисткой; кнопка сброса только при активных
    const status = w.find('[data-testid="coverage-status-filter"]')
    expect(status.text()).toContain('все статусы')
    expect(w.find('[data-testid="coverage-reset-filters"]').exists()).toBe(false)
    vm.statusFilter = 'missing'
    vm.search = 'qa'
    await settle()
    expect(w.find('[data-testid="coverage-reset-filters"]').exists()).toBe(true)
    await w.find('[data-testid="coverage-reset-filters"]').trigger('click')
    await settle()
    expect(vm.statusFilter).toBe(null)
    expect(vm.search).toBe('')
    expect(vm.filtered.length).toBe(3)

    // пагинация из коробки: 20 строк на страницу, счётчик «N из M»
    expect(w.find('[data-testid="coverage-table"] .p-paginator').exists()).toBe(true)
    expect(w.text()).toContain('3 из 3')
  })

  it('возврат: только исключённые выбранные уходят в include', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.selection = vm.withKeys // все, включая excluded soft
    await settle()
    const saving = vm.includeSelected()
    await settle()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    useAppConfirm().state.value?.resolve('')
    ;(await import('../src/composables/useAppConfirm'))._release()
    await saving
    await settle()
    expect(competenciesApi.coverageInclude).toHaveBeenCalledWith(['soft:Разработчик бэкенд'])
  })
})
