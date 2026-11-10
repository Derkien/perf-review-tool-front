import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

// мок API-слоя контура заданий (vi.hoisted: фабрика vi.mock поднимается вверх файла)
const { reassessmentMock, registryMock } = vi.hoisted(() => {
  const reassessmentMock = {
    preview: vi.fn(async () => ({
      selected: 3, freshness_days: 30,
      created: { 'competency-self': 2, 'competency-manager-soft': 1, 'competency-manager-hard': 0 },
      skipped: { 'свежая оценка': ['Петров П.П.'] },
      previous_unfinished: [{ launch_id: 4, source: 'schema_activation', open_count: 2 }],
    })),
    launch: vi.fn(async () => ({
      launch_id: 7, selected: 3, preexisting_open: 1, freshness_days: 30,
      created: { 'competency-self': 2, 'competency-manager-soft': 1, 'competency-manager-hard': 0 },
      skipped: {},
    })),
    launches: vi.fn(async () => [{
      launch_id: 7, kind: 'competency-reassessment', source: 'cycle_start', cycle_id: 3,
      created_at: '2026-11-01T10:00:00', cancelled_at: null,
      counts: { done: 1, open: 2, cancelled: 0 },
      unfinished: [{
        assignment_id: 11, kind: 'competency-manager', matrix_kind: 'soft',
        assignee: { id: 2, name: 'Рукль Р.Р.' }, subject: { id: 5, name: 'Иванов И.И.' },
        grade: 'Старший 1', due_date: '2026-11-05', overdue: true,
        progress: { matrices: [{ kind: 'soft', specialty: 'backend', version: 2,
                                 matrix_id: 9, covered: 2, total: 5, complete: false }] },
      }],
    }]),
    cancelLaunch: vi.fn(async () => ({ ok: true, cancelled: 2 })),
    forceClose: vi.fn(async () => ({ system_marks: 3, assessed_on: '2026-11-10',
                                     closed_assignments: [11] })),
  }
  const registryRow = (over: Record<string, unknown>) => ({
    id: 21, kind: 'competency-self', kind_title: 'Самооценка компетенций',
    status: 'notified', due_date: '2026-11-20', overdue: false,
    assignee: { id: 5, name: 'Иванов И.И.' }, subject: { id: 5, name: 'Иванов И.И.' },
    context: {}, created_at: '2026-11-01T10:00:00', done_at: null, launch_id: 7,
    progress: { matrices: [] }, ...over,
  })
  const registryMock = {
    list: vi.fn(async () => ({
      total: 2, kind_titles: { 'competency-self': 'Самооценка компетенций' },
      items: [
        registryRow({}),
        registryRow({ id: 22, kind: 'peer-review', kind_title: 'Оценка коллеги',
                       status: 'done', done_at: '2026-11-03T09:00:00',
                       subject: { id: 6, name: 'Сидоров С.С.' } }),
      ],
    })),
    cancel: vi.fn(async () => ({ ok: true })),
    remind: vi.fn(async () => ({ ok: true, sent: 1 })),
    bulk: vi.fn(async () => ({ ok: true, requested: 1, applied: 1 })),
  }
  return { reassessmentMock, registryMock }
})

vi.mock('../src/api/endpoints', () => ({
  reassessmentApi: reassessmentMock,
  adminAssignmentsApi: registryMock,
  deliveryApi: { outbox: vi.fn(async () => ({
    total: 2,
    items: [
      { id: 1, channel: 'inapp', event: 'assignment-reminder', recipient: '5',
        subject: 'Напоминание', status: 'sent', attempts: 1, last_error: null,
        created_at: '2026-11-10T10:00:00', sent_at: '2026-11-10T10:00:00' },
      { id: 2, channel: 'email', event: 'competency-reassessment-self', recipient: 'i@x.ru',
        subject: 'Переоценка', status: 'failed', attempts: 3, last_error: 'smtp timeout',
        created_at: '2026-11-10T09:00:00', sent_at: null },
    ],
  })) },
  staffApi: {
    listEmployees: vi.fn(async () => [
      { id: 5, full_name: 'Иванов И.И.', functional_group: 'backend' },
      { id: 6, full_name: 'Сидоров С.С.', functional_group: 'frontend' },
    ]),
    orgUnits: vi.fn(async () => [{ id: 1, parent_id: null, name: 'Платформа', kind: 'dept', path: 'Платформа' }]),
  },
  adminApi: {
    users: vi.fn(async () => []),
    settings: vi.fn(async () => ({
      autocalibration_weights: {}, raise_rules: {}, leader_assessment: {},
      workflow_gates: {}, delegation: {},
      competency_reassessment: { freshness_days: 45, cycle_start_enabled: false,
                                reminders: { enabled: false, time: '12:00', interval_days: 2, max_per_assignment: 3 } },
    })),
    putSettings: vi.fn(async () => ({})),
    permissionsCatalog: vi.fn(async () => ({ roles: [], superuser_role: 'admin', permissions: [], matrix: {} })),
    activity: vi.fn(async () => []),
    audit: vi.fn(async () => []),
  },
  notificationsApi: { unreadCount: vi.fn(async () => ({ count: 0, open_assignments: 0 })) },
  reviewsApi: { workflowSchema: vi.fn(async () => ({ places: [], transitions: [] })) },
  competenciesApi: {},
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String((e as Error)?.message || e),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/admin' }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
// память: мок confirm-композабла — отдельно от тестов модалки; здесь мокаем,
// чтобы тесты «клик → уходящий запрос» не зависели от UI подтверждения
vi.mock('../src/composables/useAppConfirm', () => ({
  useAppConfirm: () => ({ state: { value: null },
                          ask: vi.fn(async () => 'ok') }),
}))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import ReassessmentTab from '../src/components/ReassessmentTab.vue'
import OutboxLogTab from '../src/components/OutboxLogTab.vue'
import AdminAssignmentsTab from '../src/components/AdminAssignmentsTab.vue'
import AdminView from '../src/views/AdminView.vue'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import { reassessmentApi, adminAssignmentsApi } from '../src/api/endpoints'
import { useAuth } from '../src/stores/auth'

async function settle(ms = 20) {
  await new Promise((r) => setTimeout(r, ms))
}

/** PrimeVue Select: выбор = эмит update:modelValue + change (тест «клик → запрос») */
async function pick(w: ReturnType<typeof mount>, testid: string, value: string) {
  const sel = w.findAllComponents(Select)
    .find((c) => c.attributes('data-testid') === testid)
  if (!sel) throw new Error(`Select ${testid} not found`)
  sel.vm.$emit('update:modelValue', value)
  sel.vm.$emit('change', { value })
  await settle()
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

const HostReassessment = defineComponent({
  render: () => h('div', [h(ReassessmentTab)]),
})

describe('ReassessmentTab: конвейер запуска (9.2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('предпросмотр уходит с телом фильтров; списки «получат»/«отсеиваются» и блок прежних запусков', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(HostReassessment, { global: { stubs: { teleport: true } } })
    await settle()
    expect(reassessmentApi.launches).toHaveBeenCalled()

    await pick(w, 'filter-group', 'backend')
    await w.find('[data-testid="btn-preview"]').trigger('click')
    await settle()
    expect(reassessmentApi.preview).toHaveBeenCalledWith({
      functional_group: 'backend', org_unit_id: null, employee_ids: [], due_date: null })
    expect(w.find('[data-testid="preview-block"]').text()).toContain('Получат задания: 3')
    expect(w.text()).toContain('свежая оценка')
    expect(w.text()).toContain('Петров П.П.')
    expect(w.find('[data-testid="previous-unfinished"]').text())
      .toContain('запуск #4')
  })

  it('запуск неактивен до предпросмотра; после — уходит с теми же фильтрами', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(HostReassessment, { global: { stubs: { teleport: true } } })
    await settle()
    const launchBtn = w.find('[data-testid="btn-launch"]')
    expect(launchBtn.exists()).toBe(false) // кнопки нет, пока нет предпросмотра

    await w.find('[data-testid="btn-preview"]').trigger('click')
    await settle()
    await w.find('[data-testid="btn-launch"]').trigger('click')
    await settle()
    expect(reassessmentApi.launch).toHaveBeenCalledWith({
      functional_group: null, org_unit_id: null, employee_ids: [], due_date: null })
    expect(w.find('[data-testid="launch-summary"]').text()).toContain('Запуск #7')
  })

  it('список запусков: прогресс, пометка источника «цикл», просрочка, отмена с id запуска', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(HostReassessment, { global: { stubs: { teleport: true } } })
    await settle()
    const text = w.text()
    expect(text).toContain('выполнено 1 из 3')
    expect(text).toContain('цикл #3')
    // незаполненные — под раскрытием карточки запуска
    await w.find('.launch-head').trigger('click')
    await settle()
    expect(w.text()).toContain('просрочено')

    await w.find('[data-testid="btn-cancel-launch"]').trigger('click')
    await settle()
    expect(reassessmentApi.cancelLaunch).toHaveBeenCalledWith(7)
  })

  it('force-close из прогресса уходит с employee/matrix/assessor_kind', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(HostReassessment, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('.launch-head').trigger('click')
    await settle()
    await w.find('[data-testid="btn-force-close"]').trigger('click')
    await settle()
    expect(reassessmentApi.forceClose).toHaveBeenCalledWith({
      employee_id: 5, matrix_id: 9, assessor_kind: 'manager' })
  })
})

describe('OutboxLogTab: лог рассылки (9.3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('таблица рендерит строки outbox с каналами и статусами', async () => {
    setAuth(['ROLE_R_DELIVERY_LOG'])
    const w = mount(OutboxLogTab, { global: { stubs: { teleport: true } } })
    await settle()
    const text = w.find('[data-testid="outbox-table"]').text()
    expect(text).toContain('assignment-reminder')
    expect(text).toContain('failed')
    expect(text).toContain('smtp timeout')
    expect(text).toContain('i@x.ru')
  })

  it('фильтр статуса уходит параметром запроса', async () => {
    const { deliveryApi } = await import('../src/api/endpoints')
    setAuth(['ROLE_R_DELIVERY_LOG'])
    const w = mount(OutboxLogTab, { global: { stubs: { teleport: true } } })
    await settle()
    await pick(w, 'filter-status', 'failed')
    expect(deliveryApi.outbox).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }))
  })
})

describe('AdminAssignmentsTab: реестр заданий (13.2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('таблица: тип из реестра, исполнитель/объект, статусы; фильтр типа уходит в запрос', async () => {
    setAuth(['ROLE_U_ASSIGNMENTS'])
    const w = mount(AdminAssignmentsTab, { global: { stubs: { teleport: true } } })
    await settle()
    const text = w.find('[data-testid="assignments-table"]').text()
    expect(text).toContain('Самооценка компетенций')
    expect(text).toContain('Иванов И.И.')
    expect(text).toContain('выполнено')

    await pick(w, 'filter-kind', 'competency-self')
    expect(adminAssignmentsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'competency-self' }))
  })

  it('отмена из строки: подтверждение → запрос с точным id', async () => {
    setAuth(['ROLE_U_ASSIGNMENTS'])
    const w = mount(AdminAssignmentsTab, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('[data-testid="row-cancel"]').trigger('click')
    await settle()
    expect(adminAssignmentsApi.cancel).toHaveBeenCalledWith(21)
  })

  it('напоминание из строки уходит с id; для done-заданий кнопок действий нет', async () => {
    setAuth(['ROLE_U_ASSIGNMENTS'])
    const w = mount(AdminAssignmentsTab, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('[data-testid="row-remind"]').trigger('click')
    await settle()
    expect(adminAssignmentsApi.remind).toHaveBeenCalledWith(21)
    // выполненное задание (вторая строка) — без кнопок отмены/напоминания
    expect(w.findAll('[data-testid="row-cancel"]').length).toBe(1)
    expect(w.findAll('[data-testid="row-remind"]').length).toBe(1)
  })
})

describe('AdminView: вкладки и настройки (9.4/9.7)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('вкладки заданийого контура скрыты без своих прав', async () => {
    setAuth(['ROLE_U_SETTINGS'])
    const w = mount(AdminView, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).not.toContain('Переоценка компетенций')
    expect(tabs).not.toContain('Задания')
    expect(tabs).not.toContain('Лог рассылки')
  })

  it('группа настроек competency_reassessment: значения из API и PUT при изменении', async () => {
    const { adminApi } = await import('../src/api/endpoints')
    setAuth(['ROLE_U_SETTINGS', 'ROLE_U_COMPETENCY_MATRIX'])
    const w = mount(AdminView, { global: { stubs: { teleport: true, RadarChart: true } } })
    await settle()
    const block = w.find('[data-testid="reassessment-settings"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('Окно свежести')

    const input = block.findComponent(InputNumber)
    input.vm.$emit('update:modelValue', 60)
    await settle()
    expect(adminApi.putSettings).toHaveBeenCalledWith(expect.objectContaining({
      competency_reassessment: expect.objectContaining({ freshness_days: 60 }),
    }))
  })
})
