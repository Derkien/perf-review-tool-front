import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

// мок API-слоя: ответы схем матриц + кадровые сводки
vi.mock('../src/api/endpoints', () => ({
  competenciesApi: {
    types: vi.fn(async () => [
      { code: 'hard', title: 'Харды', order_no: 1 },
      { code: 'soft', title: 'Софты', order_no: 2 },
    ]),
    schemasCoverage: vi.fn(async () => []),
    schemas: vi.fn(async () => ({
      groups: [{
        type_code: 'hard', specialty: 'backend', has_draft: true,
        versions: [
          { id: 11, version: 1, status: 'archived', items_count: 2, created_at: '2026-09-01T10:00:00' },
          { id: 12, version: 2, status: 'active', items_count: 2, created_at: '2026-10-01T10:00:00' },
          { id: 13, version: 3, status: 'draft', items_count: 3, created_at: '2026-11-05T10:00:00' },
        ],
      }],
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
    schemaExport: vi.fn(async () => new Blob(['schema-xlsx'])),
    activateSchema: vi.fn(async () => ({ id: 12, status: 'active', version: 2, former_active_archived: true })),
    deleteSchemaDraft: vi.fn(async () => ({ ok: true })),
    previewSchemaImport: vi.fn(async () => ({
      batch_id: 77, type: 'competency-schema', rows_total: 3, conflicts: [],
      month: null, preview: [],
      pairs: [
        { type_code: 'hard', specialty: 'backend', items_count: 2, next_version: 3,
          active: true, status: 'changed', active_version: 2,
          diff: { added: [{ category: '', name: 'Kafka' }], removed: [],
                  changed: [{ category: '', name: 'Python', changes: ['описание «Стажёр»'] }] },
          content_hash: 'h1' },
        { type_code: 'hard', specialty: 'nosql-ops', items_count: 1, next_version: 1,
          active: false, status: 'new', diff: null, content_hash: 'h2' },
        { type_code: 'soft', specialty: 'Разработчик бэкенд', items_count: 8, next_version: 3,
          active: true, status: 'unchanged', active_version: 2,
          diff: { added: [], removed: [], changed: [] }, content_hash: 'h3' },
      ],
      warnings: [{ type_code: 'hard', specialty: 'nosql-ops', warning: 'роль не найдена среди сотрудников (проверьте написание)' }],
    })),
    applySchemaImport: vi.fn(async () => ({ ok: true })),
    radar: vi.fn(async () => ({
      axis: ['Пункт A'], self: [3], manager: [4], norm: [5], norm_grade: 'Основной 1',
      gaps: [],
      matrices: [{ id: 12, type_code: 'hard', specialty: 'backend', version: 2 }],
      versions: [
        { matrix_id: 12, version: 2, status: 'active', specialty: 'backend', latest_mark_date: '2026-10-01' },
        { matrix_id: 11, version: 1, status: 'archived', specialty: 'backend', latest_mark_date: '2026-09-01' },
      ],
      categories: [{ name: 'Пункт A', items: [
        { item_id: 1, name: 'Пункт A', self: 3, manager: 4, norm: 5 }] }],
      summary: { overestimated: [], growth_zones: [], avg_self: 3, avg_manager: 4 },
    })),
    matrix: vi.fn(async () => [
      { type_code: 'hard', specialty: 'backend', item_id: 1, item: 'Пункт A', category: '',
        descriptions: {}, self: null, manager: null },
    ]),
    sessions: vi.fn(async () => [
      { type_code: 'hard', date: '2026-10-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 2, user_marks: 2, system_marks: 0, matrix_id: 12, version: 2, is_current: true },
      { type_code: 'hard', date: '2026-09-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 2, user_marks: 1, system_marks: 1, matrix_id: 11, version: 1, is_current: false },
      { type_code: 'hard', date: '2026-08-01', assessor_kind: 'manager', assessor: 'Тест',
        marks: 1, user_marks: 1, system_marks: 0, matrix_id: 11, version: 1, is_current: false },
    ]),
    sessionDetail: vi.fn(async () => ({ rows: [], categories: { self: [], manager: [] } })),
  },
  competencyTypesApi: {
    all: vi.fn(async () => [
      { code: 'hard', title: 'Харды', order_no: 1, is_active: true },
      { code: 'soft', title: 'Софты', order_no: 2, is_active: true },
    ]),
    create: vi.fn(async () => ({ code: 'product', title: 'Продуктовые', order_no: 3 })),
    patch: vi.fn(async () => ({ code: 'soft', title: 'Софты', order_no: 2, is_active: false })),
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

  it('видна с правом; бейдж черновика и статусы версий — из ответа API', async () => {
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).toContain('Матрицы компетенций')
    const tab = w.findComponent(CompetencySchemasTab)
    expect(tab.exists()).toBe(true)
    expect(tab.text()).toContain('есть черновик')          // бейдж группы
  })
})

describe('CompetencySchemasTab: предпросмотр/apply импорта и шаблон (5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  it('загрузка файла → модалка с диффом пар и предупреждением → apply с batch_id и force', async () => {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.vm
    vm.file = new File(['x'], 'schema.xlsx')
    await vm.uploadSchema()
    await settle()
    expect(competenciesApi.previewSchemaImport).toHaveBeenCalled()
    // статусы пар из API: изменилось/новая/без изменений; счётчики диффа видны без раскрытия
    expect(w.text()).toContain('изменилось')
    expect(w.text()).toContain('новая')
    expect(w.text()).toContain('без изменений — версия не поднимется')
    expect(w.find('[data-testid="pair-diff-counts"]').text()).toBe('+1 −0 ~1')
    expect(w.text()).toContain('роль не найдена среди сотрудников') // предупреждение в модалке
    // unchanged-пара включает явный override администратора
    await w.find('[data-testid="force-row"] input').setValue(true)
    await vm.applyUpload()
    await settle()
    expect(competenciesApi.applySchemaImport).toHaveBeenCalledWith(77, true) // batch_id + force
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

  it('блокирующие ошибки 422 — персистентная модалка со списком и файлом ошибок (приёмка 12.11)', async () => {
    ;(competenciesApi.previewSchemaImport as any).mockRejectedValueOnce({
      status: 422,
      detail: {
        message: 'файл не принят целиком — исправьте ошибки и загрузите заново',
        errors: [
          { sheet: 'Матрица', row: 2, reason: 'пункт «Python» в справочнике связан с категорией «без категории», а не «Язык программирования»' },
          { sheet: 'Матрица', row: 3, reason: 'роль «Разработчик бэкенд» (тип hard) не найдена среди должностей/функциональных групп сотрудников' },
        ],
      },
    })
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.vm
    vm.file = new File(['x'], 'schema.xlsx')
    await vm.uploadSchema()
    await settle()
    expect(vm.importErrorsVisible).toBe(true)
    expect(w.text()).toContain('файл не принят целиком')
    expect(w.text()).toContain('связан с категорией')   // строки ошибок в таблице
    expect(w.text()).toContain('не найдена среди должностей')
    // ошибки можно скачать файлом — кнопка в модалке
    expect(w.find('[data-testid="import-errors-download"]').exists()).toBe(true)
  })

  it('«Скачать текущую схему» — blob-запрос с matrix_id активной версии (приёмка 12.11)', async () => {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    let clicked = false
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = (() => 'blob:x') as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL
    ;(HTMLAnchorElement.prototype as any).click = () => { clicked = true }
    const btn = w.find('[data-testid="schema-export-hard-backend"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await settle()
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    // активная версия группы (id 12) — выгрузка в формате импорта
    expect(competenciesApi.schemaExport).toHaveBeenCalledWith(12)
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
    const w = await mountAndSelect(13) // draft v3
    expect(competenciesApi.schemaDemo).toHaveBeenCalledWith(13)
    expect(w.text()).toContain('демо-данные')
    expect(w.text()).toContain('Схема ещё не опубликована')
    expect(w.text()).toContain('Python')                 // оси из ответа demo
    expect(w.text()).toContain('самооценка 3 · рукля 4') // серии из ответа demo
  })

  it('для активной/архивной версии блока демо нет', async () => {
    for (const id of [11, 12]) {
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
    const btn = w.findAll('button').find((b) => b.attributes('data-testid') === 'version-activate')!
    await btn.trigger('click')
    await settle(5)
    const modal = w.find('.p-dialog')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('прежняя активная уйдёт в архив, история сохранится')
    expect(modal.text()).toContain('Активировать версию: v3')   // объект действия
    expect(modal.text()).toContain('Сейчас активна: v2')
    const ok = w.findAll('button').find((b) => b.text() === 'Активировать' && b.attributes('severity') !== 'secondary')
    // ОК в футере модалки — текстовая кнопка внутри диалога (в таблице — иконки)
    await modal.findAll('button').find((b) => b.text() === 'Активировать')!.trigger('click')
    await settle()
    expect(competenciesApi.activateSchema).toHaveBeenCalledWith(13)
    expect(trackAction).toHaveBeenCalledWith('admin.competency-schemas',
      { action: 'activate', matrix_id: 13 })
    expect(ok).toBeTruthy()
  })

  it('отмена модалки не отправляет ничего', async () => {
    const w = await mountHost()
    await w.findAll('button').find((b) => b.attributes('data-testid') === 'version-activate')!.trigger('click')
    await settle(5)
    await w.findAll('button').find((b) => b.text() === 'Отмена')!.trigger('click')
    await settle()
    expect(competenciesApi.activateSchema).not.toHaveBeenCalled()
  })

  it('модалка удаления черновика: объект действия; ОК шлёт delete с точным id', async () => {
    const w = await mountHost()
    await w.findAll('button').find((b) => b.attributes('data-testid') === 'version-delete')!.trigger('click')
    await settle(5)
    const modal = w.find('.p-dialog')
    expect(modal.text()).toContain('Удалить черновик: v3')
    expect(modal.text()).toContain('Роль: backend')
    await w.findAll('button').filter((b) => b.text() === 'Удалить черновик').at(-1)!.trigger('click')
    await settle()
    expect(competenciesApi.deleteSchemaDraft).toHaveBeenCalledWith(13)
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

describe('CompetenciesTab: версионность просмотра (6.1–6.3 + change 2: 3.1–3.3)', () => {
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

  it('вкладки типов — из реестра GET /types, порядок order_no (3.1)', async () => {
    const w = mountTab()
    await settle()
    const tabs = w.find('[data-testid="type-tabs"]')
    expect(tabs.exists()).toBe(true)
    expect(tabs.findAll('button').map((b) => b.text())).toEqual(['Харды', 'Софты'])
    const vm: any = w.vm
    expect(vm.kind).toBe('hard') // дефолт — первый по order_no
  })

  it('бейдж версии схемы из ответа radar (6.1)', async () => {
    const w = mountTab()
    await settle()
    const badge = w.find('[data-testid="schema-version-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('v2')
  })

  it('селектор версий: дефолт — актуальная; смена фильтрует историю и шлёт matrix_id (3.2)', async () => {
    const w = mountTab()
    await settle()
    const vm: any = w.vm
    // дефолт: история показывает только сессии текущей версии
    expect(vm.selectedMatrixId).toBe(0)
    expect(w.findAll('tr').filter((r) => r.text().includes('2026-')).length).toBe(1)
    // две версии — селектор виден, с метками статусов
    const select = w.find('[data-testid="version-select"]')
    expect(select.exists()).toBe(true)
    expect(vm.versionSelectOptions.map((o: { label: string }) => o.label))
      .toEqual(['Текущая (v2)', 'v1 — архивная'])
    // выбор архивной версии v1: график по её matrix_id, история — только её сессии
    vm.selectedMatrixId = 11
    await vm.onVersionChange()
    await settle()
    expect(competenciesApi.radar).toHaveBeenLastCalledWith(5, 'hard', undefined, undefined, 11)
    const dates = w.findAll('tr').filter((r) => r.text().includes('2026-')).map((r) => r.text())
    expect(dates.length).toBe(2) // обе сессии v1
  })

  it('история выбранной версии: закрытая архивная — read-only, незакрытая — редактируется (6.2)', async () => {
    const w = mountTab()
    await settle()
    const vm: any = w.vm
    vm.selectedMatrixId = 11
    await vm.onVersionChange()
    await settle()
    const rows = w.findAll('tr')
    // закрытая сессия v1 (marks 2 из 2 пунктов версии): глаз вместо карандаша, без удаления
    const closedRow = rows.find((r) => r.text().includes('2026-09-01'))!
    expect(closedRow.find('[data-testid="session-view"]').exists()).toBe(true)
    expect(closedRow.find('.pi-pencil').exists()).toBe(false)
    expect(closedRow.find('.pi-trash').exists()).toBe(false)
    // незакрытая сессия v1 (marks 1 из 2): редактируется — продолжение заполнения
    const openRow = rows.find((r) => r.text().includes('2026-08-01'))!
    expect(openRow.find('.pi-pencil').exists()).toBe(true)
  })

  it('колонка «Пунктов» X/Y и тег «по норме грейда» у системных значений (3.3)', async () => {
    const w = mountTab()
    await settle()
    const vm: any = w.vm
    vm.selectedMatrixId = 11
    await vm.onVersionChange()
    await settle()
    const closedRow = w.findAll('tr').find((r) => r.text().includes('2026-09-01'))!
    expect(closedRow.find('[data-testid="session-completeness"]').text()).toBe('2/2')
    expect(closedRow.find('[data-testid="norm-grade-tag"]').exists()).toBe(true)
    expect(closedRow.find('[data-testid="norm-grade-tag"]').text()).toBe('по норме грейда')
  })

  it('сравнение: список предлагает сессии выбранной версии; info-попап с объяснением (6.3)', async () => {
    const w = mountTab()
    await settle()
    const vm: any = w.vm
    // дефолт (v2): клик по единственной видимой сессии добавляет сравнение
    await vm.toggleCompare(vm.visibleSessions[0])
    expect(vm.compareKeys).toHaveLength(1)
    // на архивной версии сравниваются её сессии — тоже внутри одной версии
    vm.selectedMatrixId = 11
    await vm.onVersionChange()
    await settle()
    await vm.toggleCompare(vm.visibleSessions[0])
    expect(vm.compareKeys).toHaveLength(1) // сравнения сброшены при смене версии
    expect(w.find('[data-testid="compare-info-text"]').exists()).toBe(false)
    await w.find('[data-testid="compare-info"]').trigger('click')
    expect(w.find('[data-testid="compare-info-text"]').text())
      .toContain('только в рамках одной версии схемы')
  })
})

describe('CompetencySchemasTab: реестр типов (3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
    setAuth(['ROLE_U_COMPETENCY_MATRIX'])
  })

  it('таблица типов из /types/all; создание типа — уходящий POST с телом', async () => {
    const w = mount(CompetencySchemasTab, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const vm: any = w.vm
    expect(vm.registryTypes.map((t: { code: string }) => t.code)).toEqual(['hard', 'soft'])
    // создать: диалог → code/title → submit = уходящий запрос с точным телом
    await w.find('[data-testid="type-create-btn"]').trigger('click')
    await settle(5)
    expect(w.find('[data-testid="type-code-input"]').exists()).toBe(true)
    await w.find('[data-testid="type-code-input"]').setValue('product')
    await w.find('[data-testid="type-title-input"]').setValue('Продуктовые')
    await w.find('[data-testid="type-submit"]').trigger('click')
    await settle()
    const { competencyTypesApi } = await import('../src/api/endpoints')
    expect(competencyTypesApi.create).toHaveBeenCalledWith(
      { code: 'product', title: 'Продуктовые', order_no: expect.any(Number) })
  })

  it('деактивация типа — через диалог правки с подтверждением', async () => {
    const w = mount(HostWithConfirm, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    await w.find('[data-testid="type-edit-soft"]').trigger('click')
    await settle(5)
    const activeSwitch = w.find('[data-testid="type-active-switch"], #type-active')
    // переключатель активен → off; сохранение требует подтверждения (реальная модалка)
    ;(w.findComponent(CompetencySchemasTab).vm as any).typeForm.is_active = false
    await w.findAll('button').filter((b) => b.text() === 'Сохранить').at(-1)!.trigger('click')
    await settle()
    // подтверждение — отдельная модалка (поверх диалога правки типа)
    const confirmText = w.findAll('.p-dialog').map((d) => d.text())
      .find((t) => t.includes('Деактивировать тип «soft»'))
    expect(confirmText).toBeTruthy()
    await w.findAll('button').filter((b) => b.text() === 'Деактивировать').at(-1)!.trigger('click')
    await settle()
    const { competencyTypesApi } = await import('../src/api/endpoints')
    expect(competencyTypesApi.patch).toHaveBeenCalledWith('soft',
      { title: 'Софты', order_no: 2, is_active: false })
    expect(activeSwitch).toBeTruthy()
  })
})
