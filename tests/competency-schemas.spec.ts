import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

// мок API-слоя: ответы схем матриц + кадровые сводки
vi.mock('../src/api/endpoints', () => ({
  competenciesApi: {
    schemas: vi.fn(async () => ({
      groups: [{
        kind: 'hard', specialty: 'backend', has_draft: true,
        versions: [
          { id: 13, version: 1, status: 'archived', items_count: 2, created_at: '2026-09-01T10:00:00' },
          { id: 11, version: 2, status: 'active', items_count: 2, created_at: '2026-10-01T10:00:00' },
          { id: 12, version: 3, status: 'draft', items_count: 3, created_at: '2026-11-05T10:00:00' },
        ],
      }],
      roles_without_schemas: [{ kind: 'soft', specialty: 'Разработчик бэкенд' }],
    })),
    matrixItems: vi.fn(async (id: number) => [
      { id: id * 100 + 1, matrix_id: id, name: 'Python', category: 'Языки', description: '',
        order_no: 0, level_descriptions: { 'Стажёр': 'базовый синтаксис' } },
      { id: id * 100 + 2, matrix_id: id, name: 'Go', category: 'Языки', description: '',
        order_no: 1, level_descriptions: {} },
    ]),
    schemaDemo: vi.fn(async () => ({
      axis: ['Python', 'Go', 'Docker'], self: [3, 5, 7], manager: [4, 4, 6],
      norm: [5, 5, 5], norm_grade: 'Старший 1', gaps: [],
      summary: { overestimated: [], growth_zones: [], avg_self: 5, avg_manager: 4.67 },
      demo_grade: 'Старший 1',
    })),
    schemaTemplate: vi.fn(async () => new Blob(['xlsx'])),
    activateSchema: vi.fn(async () => ({ id: 12, status: 'active', version: 2, former_active_archived: true })),
    deleteSchemaDraft: vi.fn(async () => ({ ok: true })),
    previewSchemaImport: vi.fn(async () => ({
      batch_id: 77, type: 'competency-schema', rows_total: 3, conflicts: [],
      month: null,
      preview: [
        { kind: 'hard', specialty: 'backend', name: 'Python' },
        { kind: 'hard', specialty: 'backend', name: 'Go' },
        { kind: 'hard', specialty: 'nosql-ops', name: 'Kafka' },
      ],
      warnings: [{ kind: 'hard', specialty: 'nosql-ops', warning: 'роль не найдена среди сотрудников (проверьте написание)' }],
    })),
    applySchemaImport: vi.fn(async () => ({ ok: true })),
    radar: vi.fn(async () => ({
      axis: ['Пункт A'], self: [3], manager: [4], norm: [5], norm_grade: 'Основной 1',
      gaps: [],
      matrices: [{ id: 12, kind: 'hard', specialty: 'backend', version: 2 }],
      categories: [{ name: 'Пункт A', items: [
        { item_id: 1, name: 'Пункт A', self: 3, manager: 4, norm: 5 }] }],
      summary: { overestimated: [], growth_zones: [], avg_self: 3, avg_manager: 4 },
    })),
    matrix: vi.fn(async () => [
      { kind: 'hard', specialty: 'backend', item_id: 1, item: 'Пункт A', category: '',
        descriptions: {}, self: null, manager: null },
    ]),
    sessions: vi.fn(async () => [
      { kind: 'hard', date: '2026-09-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 2, matrix_id: 11, version: 1, is_current: false },
      { kind: 'hard', date: '2026-10-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 2, matrix_id: 12, version: 2, is_current: true },
      { kind: 'hard', date: '2026-08-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 1, matrix_id: 11, version: 1, is_current: false },
    ]),
    sessionDetail: vi.fn(async () => ({ rows: [], categories: { self: [], manager: [] } })),
  },
  reviewsApi: {
    workflowSchema: vi.fn(async () => ({ places: [], transitions: [] })),
  },
  notificationsApi: {
    unreadCount: vi.fn(async () => ({ count: 0 })),
  },
  adminApi: {
    users: vi.fn(async () => []),
    settings: vi.fn(async () => ({
      autocalibration_weights: { peers: 0.3, line: 0.3, functional: 0.2, matrix: 0.1, efficiency: 0.1 },
      raise_rules: {}, leader_assessment: {}, workflow_gates: {}, delegation: {},
    })),
    permissionsCatalog: vi.fn(async () => ({ roles: [], superuser_role: 'admin', permissions: [], matrix: {} })),
    activity: vi.fn(async () => []),
    audit: vi.fn(async () => []),
  },
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String((e as Error)?.message || e),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/admin' }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
// confirm-композабл НЕ мокаем: подтверждения проверяются через реальную модалку

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import CompetencySchemasTab from '../src/components/CompetencySchemasTab.vue'
import CompetenciesTab from '../src/components/CompetenciesTab.vue'
import AdminView from '../src/views/AdminView.vue'
import AppLayout from '../src/layouts/AppLayout.vue'
import AppConfirmDialog from '../src/components/AppConfirmDialog.vue'
import { competenciesApi, trackAction } from '../src/api/endpoints'
import { useAppConfirm } from '../src/composables/useAppConfirm'
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

/** хост: вкладка + глобальная модалка подтверждений (как в AppLayout) */
const HostWithConfirm = defineComponent({
  render: () => h('div', [h(CompetencySchemasTab), h(AppConfirmDialog)]),
})

describe('AdminView: вкладка «Матрицы компетенций» (5.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
  })

  it('скрыта без ROLE_U_COMPETENCY_MATRIX', async () => {
    setAuth(['ROLE_U_SETTINGS'])
    const w = mount(AdminView, { global: { stubs: { teleport: true } } })
    await settle()
    // TabPanel рендерит содержимое всех панелей (вживую скрыто CSS) — проверяем заголовок вкладки
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).not.toContain('Матрицы компетенций')
  })

  it('видна с правом; бейдж черновика, статусы версий и «Роли без схем» — из ответа API', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).toContain('Матрицы компетенций')
    const tab = w.findComponent(CompetencySchemasTab)
    expect(tab.exists()).toBe(true)
    expect(tab.text()).toContain('есть черновик')          // бейдж группы
    expect(tab.text()).toContain('Роли без схем')
    expect(tab.text()).toContain('Разработчик бэкенд')      // сводка из кадровых данных
  })
})

describe('CompetencySchemasTab: предпросмотр/apply импорта и шаблон (5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  it('загрузка файла → модалка предпросмотра с версиями и предупреждением → apply с batch_id', async () => {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.vm
    vm.file = new File(['x'], 'schema.xlsx')
    await vm.uploadSchema()
    await settle()
    expect(competenciesApi.previewSchemaImport).toHaveBeenCalled()
    expect(w.text()).toContain('будет создан черновик v3')        // черновик v3 заменяется, номер переиспользуется (правило apply)
    expect(w.text()).toContain('роль не найдена среди сотрудников') // предупреждение в модалке
    await vm.applyUpload()
    await settle()
    expect(competenciesApi.applySchemaImport).toHaveBeenCalledWith(77) // batch_id из preview
    expect(competenciesApi.schemas).toHaveBeenCalledTimes(2)           // список перечитан
    expect(w.text()).toContain('есть черновик')
  })

  it('скачивание шаблона — blob-запрос и клик по ссылке', async () => {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    let clicked = false
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = (() => 'blob:x') as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL
    ;(HTMLAnchorElement.prototype as any).click = () => { clicked = true }
    const btn = w.findAll('button').find((b) => b.text().includes('Скачать шаблон'))!
    await btn.trigger('click')
    await settle()
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    expect(competenciesApi.schemaTemplate).toHaveBeenCalled()
    expect(clicked).toBe(true)
  })
})

describe('CompetencySchemasTab: демо-предпросмотр черновика (5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  async function mountAndSelect(versionId: number) {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.vm
    const group = vm.groups[0]
    vm.expandedRows = { [group.key]: group }
    const version = group.versions.find((v: any) => v.id === versionId)
    await vm.selectVersion(group, version)
    await settle()
    return w
  }

  it('для черновика: таблица по демо-данным, пометка «демо-данные», подпись о публикации', async () => {
    const w = await mountAndSelect(12) // draft v3
    expect(competenciesApi.schemaDemo).toHaveBeenCalledWith(12)
    expect(w.text()).toContain('демо-данные')
    expect(w.text()).toContain('Схема ещё не опубликована')
    expect(w.text()).toContain('Python')                 // оси из ответа demo
    expect(w.text()).toContain('самооценка 3 · рукля 4') // серии из ответа demo
  })

  it('для активной/архивной версии блока демо нет', async () => {
    for (const id of [11, 13]) {
      const w = await mountAndSelect(id)
      expect(w.text()).not.toContain('демо-данные')
      expect(w.text()).not.toContain('Предпросмотр примера заполнения')
    }
  })
})

describe('CompetencySchemasTab: активация/удаление через модалку подтверждения (5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  async function mountHost() {
    const w = mount(HostWithConfirm, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.findComponent(CompetencySchemasTab).vm
    const group = vm.groups[0]
    vm.expandedRows = { [group.key]: group }
    await settle()
    return w
  }

  it('модалка активации: текст предупреждения и объект действия видны; ОК шлёт activate с точным id', async () => {
    const w = await mountHost()
    const btn = w.findAll('button').find((b) => b.text() === 'Активировать')!
    await btn.trigger('click')
    await settle(5)
    const modal = w.find('.p-dialog')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('прежняя активная уйдёт в архив, история сохранится')
    expect(modal.text()).toContain('Активировать версию: v3')   // объект действия
    expect(modal.text()).toContain('Сейчас активна: v2')
    const ok = w.findAll('button').find((b) => b.text() === 'Активировать' && b.attributes('severity') !== 'secondary')
    // ОК в футере — последний «Активировать» в модалке
    await w.findAll('button').filter((b) => b.text() === 'Активировать').at(-1)!.trigger('click')
    await settle()
    expect(competenciesApi.activateSchema).toHaveBeenCalledWith(12)
    expect(trackAction).toHaveBeenCalledWith('admin.competency-schemas',
      { action: 'activate', matrix_id: 12 })
    expect(ok).toBeTruthy()
  })

  it('отмена модалки не отправляет ничего', async () => {
    const w = await mountHost()
    await w.findAll('button').find((b) => b.text() === 'Активировать')!.trigger('click')
    await settle(5)
    await w.findAll('button').find((b) => b.text() === 'Отмена')!.trigger('click')
    await settle()
    expect(competenciesApi.activateSchema).not.toHaveBeenCalled()
  })

  it('модалка удаления черновика: объект действия; ОК шлёт delete с точным id', async () => {
    const w = await mountHost()
    await w.findAll('button').find((b) => b.text() === 'Удалить черновик')!.trigger('click')
    await settle(5)
    const modal = w.find('.p-dialog')
    expect(modal.text()).toContain('Удалить черновик: v3')
    expect(modal.text()).toContain('Роль: backend')
    await w.findAll('button').filter((b) => b.text() === 'Удалить черновик').at(-1)!.trigger('click')
    await settle()
    expect(competenciesApi.deleteSchemaDraft).toHaveBeenCalledWith(12)
  })
})

describe('AppLayout: пункт меню «Админ» по массиву пермишенов (5.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // AppLayout читает глобальный $route из шаблона — даём его через конфиг mount
  function mountLayout(perms: string[]) {
    setAuth(perms)
    return mount(AppLayout, {
      global: {
        stubs: { teleport: true, RouterView: true },
        config: { globalProperties: { $route: { path: '/admin' } } as never },
      },
    })
  }

  it('виден с ROLE_U_COMPETENCY_MATRIX без ROLE_U_SETTINGS', async () => {
    const w = mountLayout(['ROLE_R_DASHBOARD', 'ROLE_U_COMPETENCY_MATRIX'])
    await settle()
    expect(w.text()).toContain('Админ')
  })

  it('скрыт без обоих пермишенов массива', async () => {
    const w = mountLayout(['ROLE_R_DASHBOARD'])
    await settle()
    expect(w.text()).not.toContain('Админ')
  })
})

describe('CompetenciesTab: версионность просмотра (6.1–6.3)', () => {
  function mountTab() {
    return mount(CompetenciesTab, {
      props: {
        employeeId: 5,
        perms: { edit_marks: true, is_self: false },
        gradeOptions: [
          { label: 'Основной 1', value: 'Основной 1' },
          { label: 'Старший 1', value: 'Старший 1' },
        ],
      },
      global: { stubs: { teleport: true, RadarChart: true } },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setAuth(['ROLE_U_COMPETENCY_MARKS'])
  })

  it('бейдж версии схемы из ответа radar (6.1)', async () => {
    const w = mountTab()
    await settle()
    const badge = w.find('[data-testid="schema-version-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('v2')
  })

  it('история: «архив» у неактивных версий; закрытая архивная — read-only, незакрытая — редактируется (6.2)', async () => {
    const w = mountTab()
    await settle()
    expect(w.text()).toContain('архив')
    const rows = w.findAll('tr')
    // закрытая сессия v1 (marks 2 из 2 пунктов версии): глаз вместо карандаша, без удаления
    const closedRow = rows.find((r) => r.text().includes('2026-09-01'))!
    expect(closedRow.find('[data-testid="session-view"]').exists()).toBe(true)
    expect(closedRow.find('.pi-pencil').exists()).toBe(false)
    expect(closedRow.find('.pi-trash').exists()).toBe(false)
    // незакрытая сессия v1 (marks 1 из 2): редактируется — продолжение заполнения
    const openRow = rows.find((r) => r.text().includes('2026-08-01'))!
    expect(openRow.find('.pi-pencil').exists()).toBe(true)
    // сессия активной версии: обычные действия
    const activeRow = rows.find((r) => r.text().includes('2026-10-01'))!
    expect(activeRow.find('.pi-pencil').exists()).toBe(true)
  })

  it('сравнение: сессии других версий не добавляются на паутинку; info-попап с объяснением (6.3)', async () => {
    const w = mountTab()
    await settle()
    const vm: any = w.vm
    await vm.toggleCompare(vm.sessions[0]) // архивная v1 — игнорируется
    expect(vm.compareKeys).toHaveLength(0)
    await vm.toggleCompare(vm.sessions[1]) // активная v2 — добавляется
    expect(vm.compareKeys).toHaveLength(1)
    expect(w.find('[data-testid="compare-info-text"]').exists()).toBe(false)
    await w.find('[data-testid="compare-info"]').trigger('click')
    expect(w.find('[data-testid="compare-info-text"]').text())
      .toContain('только в рамках одной версии схемы')
  })
})
