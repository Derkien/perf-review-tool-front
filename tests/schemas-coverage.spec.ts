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
    vm.withKeys.filter((r: any) => r.status !== 'excluded').forEach((r: any) => vm.toggleKey(r.key))
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
    vm.withKeys.slice(0, 2).forEach((r: any) => vm.toggleKey(r.key))
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
    vm.withKeys.slice(0, 1).forEach((r: any) => vm.toggleKey(r.key))
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
    vm.withKeys.slice(0, 1).forEach((r: any) => vm.toggleKey(r.key))
    await settle()
    expect(w.find('.mass-bar').exists()).toBe(true)
    expect(w.find('.mass-bar [data-testid="coverage-export-btn"]').exists()).toBe(true)

    // фильтры: селекты с placeholder «все …» и очисткой; кнопка сброса только при активных
    const status = w.find('[data-testid="coverage-status-filter"]')
    expect(status.text()).toContain('все статусы')
    expect(w.find('[data-testid="coverage-reset-filters"]').exists()).toBe(false)
    vm.statusFilter = 'missing'
    vm.typeFilter = ['hard']
    vm.search = 'q'
    await settle()
    expect(w.find('[data-testid="coverage-reset-filters"]').exists()).toBe(true)
    await w.find('[data-testid="coverage-reset-filters"]').trigger('click')
    await settle()
    expect(vm.statusFilter).toBe(null)
    expect(vm.typeFilter).toEqual([])
    expect(vm.search).toBe('')
    expect(vm.filtered.length).toBe(3)

    // авто-пагинация AppTable: 3 строки ≤ 20 → пагинатор скрыт (правило ≤20)
    expect(w.find('[data-testid="coverage-table"] .p-paginator').exists()).toBe(false)
    // счётчик строк рисует AppTable (слот фильтров coverage)
    expect(w.find('.app-table-count').text()).toBe('строк: 3')
  })

  it('регресс 17.11: выбор переживает смену фильтра — выгрузка полным набором', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    // выбрал hard-строку при фильтре hard
    vm.typeFilter = ['hard']
    await settle()
    vm.toggleKey(vm.filtered[0].key)                      // hard:backend
    // сменил фильтр на soft: DataTable сбрасывает видимый выбор (отдал пустое) —
    // ключ hard:backend обязан выжить
    vm.typeFilter = ['soft']
    await settle()
    vm.toggleKey(vm.filtered[0].key)                       // + soft-строка (свой чекбокс —
                                                           //  смена фильтра выбор не трогает)
    expect(vm.selectedPairs).toEqual(['hard:backend', 'soft:Разработчик бэкенд'])
    expect(vm.hiddenSelected).toBe(1)                      // hard скрыт фильтром
    await vm.exportSelected()
    await settle()
    expect(competenciesApi.coverageExport).toHaveBeenCalledWith(
      ['hard:backend', 'soft:Разработчик бэкенд'])         // ПОЛНЫЙ набор, не усечённый
  })

  it('клик по чекбоксу строки (свой слой) — выбор регистрируется без магии DataTable', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    expect(w.find('[data-testid="coverage-check-hard:backend"]').exists()).toBe(true)
    await w.find('[data-testid="coverage-check-hard:backend"] input').trigger('change')
    await settle()
    expect(vm.selectedKeys.has('hard:backend')).toBe(true)
    // повторный клик снимает (чекбокс перерендерен — ищем заново)
    await w.find('[data-testid="coverage-check-hard:backend"] input').trigger('change')
    await settle()
    expect(vm.selectedKeys.has('hard:backend')).toBe(false)
  })

  it('строчные действия: Выгрузить пары, Исключить/Вернуть с подтверждением', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    URL.createObjectURL = (() => 'blob:x') as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL
    ;(HTMLAnchorElement.prototype as any).click = () => undefined
    await w.find('[data-testid="coverage-row-export-hard:backend"]').trigger('click')
    await settle()
    expect(competenciesApi.coverageExport).toHaveBeenCalledWith(['hard:backend'])

    // soft-пара в моке исключена → на строке кнопка «Вернуть» (include)
    await w.find('[data-testid="coverage-row-include-soft:Разработчик бэкенд"]')
      .trigger('click')
    await settle()
    const { useAppConfirm } = await import('../src/composables/useAppConfirm')
    expect(useAppConfirm().state.value?.header).toContain('Вернуть')
    useAppConfirm().state.value?.resolve('')
    ;(await import('../src/composables/useAppConfirm'))._release()
    await settle()
    expect(competenciesApi.coverageInclude).toHaveBeenCalledWith(['soft:Разработчик бэкенд'])
    // не-исключённая пара — кнопка «Исключить»
    await w.find('[data-testid="coverage-row-exclude-hard:backend"]').trigger('click')
    await settle()
    expect(useAppConfirm().state.value?.header).toContain('Исключить')
    useAppConfirm().state.value?.resolve('')
    ;(await import('../src/composables/useAppConfirm'))._release()
    await settle()
    expect(competenciesApi.coverageExclude).toHaveBeenCalledWith(['hard:backend'])
  })

  it('возврат: только исключённые выбранные уходят в include', async () => {
    const w = mount(SchemasCoverageTab, { global: { stubs: { teleport: true } } })
    await settle()
    const vm: any = w.vm
    vm.withKeys.forEach((r: any) => vm.toggleKey(r.key)) // все, включая excluded soft
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
