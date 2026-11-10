import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'

// единый список заданий хаба (все типы одним API — 12.6)
const mine = [
  { id: 1, kind: 'self-review', kind_title: 'Селф-ревью', status: 'notified',
    due_date: null, overdue: false, assignee: { id: 5, name: 'Иванов И.И.' },
    subject: { id: 5, name: 'Иванов И.И.' }, context: { cycle_id: 3 },
    created_at: '2026-11-01T10:00:00', done_at: null, launch_id: null,
    progress: { matrices: [] } },
  { id: 2, kind: 'competency-self', kind_title: 'Самооценка компетенций', status: 'notified',
    due_date: '2026-11-05', overdue: true, assignee: { id: 5, name: 'Иванов И.И.' },
    subject: { id: 5, name: 'Иванов И.И.' }, context: {},
    created_at: '2026-11-01T10:00:00', done_at: null, launch_id: 7,
    progress: { matrices: [
      { kind: 'soft', specialty: 'backend', version: 2, matrix_id: 9, covered: 1, total: 5, complete: false },
      { kind: 'hard', specialty: 'backend', version: 3, matrix_id: 10, covered: 4, total: 4, complete: true },
    ] } },
  { id: 3, kind: 'competency-manager', kind_title: 'Оценка подчинённых (soft)', status: 'notified',
    due_date: null, overdue: false, assignee: { id: 5, name: 'Иванов И.И.' },
    subject: { id: 6, name: 'Сидоров С.С.' }, context: { matrix_kind: 'soft' },
    created_at: '2026-11-01T10:00:00', done_at: null, launch_id: 7,
    progress: { matrices: [{ kind: 'soft', specialty: 'backend', version: 2, matrix_id: 9, covered: 2, total: 5, complete: false }] } },
  { id: 4, kind: 'competency-manager', kind_title: 'Оценка подчинённых (soft)', status: 'done',
    due_date: null, overdue: false, assignee: { id: 5, name: 'Иванов И.И.' },
    subject: { id: 7, name: 'Кузнецов К.К.' }, context: { matrix_kind: 'soft' },
    created_at: '2026-11-01T10:00:00', done_at: '2026-11-03T10:00:00', launch_id: 7,
    progress: { matrices: [] } },
  { id: 5, kind: 'peer-review', kind_title: 'Оценка коллеги', status: 'pending',
    due_date: null, overdue: false, assignee: { id: 5, name: 'Иванов И.И.' },
    subject: { id: 8, name: 'Петров П.П.' }, context: { cycle_id: 3, assessor_role: 'peer' },
    created_at: '2026-11-01T10:00:00', done_at: null, launch_id: null,
    progress: { matrices: [] } },
]

vi.mock('../src/api/endpoints', () => ({
  assignmentsApi: {
    mine: vi.fn(async () => mine),
    subordinates: vi.fn(async () => []),
    detail: vi.fn(async () => ({
      id: 5, achievements: [{ text: 'Достижение 1', self_rating: 'A' }],
      self_submitted: true,
    })),
    cancel: vi.fn(async () => ({ ok: true })),
  },
  reviewsApi: {
    submitPeerReview: vi.fn(async () => ({ ok: true })),
    workflowSchema: vi.fn(async () => ({
      places: [{ name: 'preparation', label: 'Подготовка', description: '' }],
      transitions: [
        { name: 'start_self_review', from: ['preparation'], to: 'self-review',
          label: 'старт ревью', permission: 'p', description: 'd', gate: null,
          gate_label: null, gate_enabled: null,
          assignments: 'карточка селф-ревью + переоценка компетенций' },
        { name: 'start_leader_assessment', from: ['peer-review'], to: 'leader-assessment',
          label: 'предоценки', permission: 'p', description: 'd2', gate: null,
          gate_label: null, gate_enabled: null, assignments: null },
      ],
    })),
  },
  notificationsApi: {
    mine: vi.fn(async () => ({
      total: 2,
      items: [
        { id: 1, title: 'Переоценка компетенций', body: '', is_read: false,
          created_at: '2026-11-10T10:00:00', url: '/assessments' },
        { id: 2, title: 'Без ссылки', body: '', is_read: true,
          created_at: '2026-11-09T10:00:00', url: null },
      ],
    })),
    markRead: vi.fn(async () => ({ ok: true })),
    readAll: vi.fn(async () => ({ ok: true })),
    unreadCount: vi.fn(async () => ({ count: 1, open_assignments: 3 })),
  },
  competenciesApi: {
    radar: vi.fn(async () => ({
      axis: ['Пункт A'], self: [3], manager: [4], norm: 5, gaps: [],
      matrices: [{ id: 9, kind: 'soft', specialty: 'backend', version: 2 }],
      summary: null,
      session_1: [4], session_1_default: [true],
    })),
    matrix: vi.fn(async () => [
      { kind: 'soft', specialty: 'backend', item_id: 1, item: 'Пункт A', category: '',
        descriptions: {}, self: null, manager: null },
    ]),
    sessions: vi.fn(async () => [
      { kind: 'soft', date: '2026-10-01', assessor_kind: 'manager', assessor: 'Рук',
        marks: 20, user_marks: 15, system_marks: 5, matrix_id: 9, version: 2, is_current: true },
    ]),
    matrixItems: vi.fn(async () => Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))),
    sessionDetail: vi.fn(async () => [
      { item_id: 1, item: 'Пункт A', category: '', descriptions: {},
        assessor_kind: 'manager', level: 'Старший 1', weight: 6, is_default: true },
    ]),
    createMark: vi.fn(async () => ({ ok: true })),
  },
  reassessmentApi: {
    forceClose: vi.fn(async () => ({ system_marks: 5, assessed_on: '2026-11-10',
                                     closed_assignments: [2] })),
    preview: vi.fn(), launch: vi.fn(), launches: vi.fn(async () => []), cancelLaunch: vi.fn(),
  },
  staffApi: { card: vi.fn(async () => ({ full_name: 'Иванов И.И.', grade: 'Старший 1' })) },
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String((e as Error)?.message || e),
}))
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/assessments' }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../src/composables/useAppConfirm', () => ({
  useAppConfirm: () => ({ state: { value: null },
                          ask: vi.fn(async () => 'ok') }),
}))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import AssessmentsView from '../src/views/AssessmentsView.vue'
import AssignmentGuide from '../src/components/AssignmentGuide.vue'
import NotificationsView from '../src/views/NotificationsView.vue'
import CompetenciesTab from '../src/components/CompetenciesTab.vue'
import WorkflowSchema from '../src/components/WorkflowSchema.vue'
import { assignmentsApi, notificationsApi, reviewsApi, competenciesApi,
  reassessmentApi } from '../src/api/endpoints'
import { useAuth } from '../src/stores/auth'

async function settle(ms = 30) {
  await new Promise((r) => setTimeout(r, ms))
}

function setAuth(perms: string[] = []) {
  setActivePinia(createPinia())
  const auth = useAuth()
  auth.me = {
    id: 1, email: 'ivanov@x.ru', full_name: 'Иванов И.И.', role: 'employee', roles: ['employee'],
    permissions: perms, has_subordinates: true, employee_id: 5,
  } as any
  return auth
}

describe('AssessmentsView: хаб «Оценки» (8.2–8.5)', () => {
  beforeEach(() => { vi.clearAllMocks(); push.mockClear() })

  it('очередь грузится одним assignments/mine; типы, бейдж просрочки и прогресс из API', async () => {
    setAuth()
    const w = mount(AssessmentsView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(assignmentsApi.mine).toHaveBeenCalledTimes(1)
    const text = w.text()
    expect(text).toContain('Карточка селф-ревью')
    expect(text).toContain('Самооценка компетенций')
    expect(text).toContain('просрочено')            // бейдж из флага overdue
    expect(text).toContain('soft — осталось 4 п.')  // прогресс покрытия из API
    expect(text).toContain('Оценка коллег')
    expect(w.find('[data-testid="empty-queue"]').exists()).toBe(false)
  })

  it('групповая карточка руководителя: X из Y, прогрессбар, раскрытие с переходом', async () => {
    setAuth()
    const w = mount(AssessmentsView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.text()).toContain('заполнено 1 из 2 сотрудников')  // done 1, всего 2 soft
    const group = w.find('.group-card')
    await group.find('.group-head').trigger('click')
    await settle()
    expect(group.text()).toContain('Сидоров С.С.')
    // переход «Разметить» — на карточку объекта
    await group.findAll('button').find((b) => b.text().includes('Разметить'))!.trigger('click')
    expect(push).toHaveBeenCalledWith('/staff/6')
  })

  it('peer-форма: валидация полноты — клик по отправке без оценок не шлёт запрос', async () => {
    setAuth()
    const w = mount(AssessmentsView, { global: { stubs: { teleport: true } } })
    await settle()
    const btn = w.findAll('button').find((b) => b.text().includes('Оценить'))
    await btn!.trigger('click')
    await settle()
    expect(assignmentsApi.detail).toHaveBeenCalledWith(5)
    // достижения есть → кнопка активна, но без оценок — только предупреждение, без запроса
    const send = w.findAll('button').find((b) => b.text().includes('Отправить оценку'))!
    expect(send.attributes('disabled')).toBeUndefined()
    await send.trigger('click')
    await settle()
    expect(reviewsApi.submitPeerReview).not.toHaveBeenCalled()
  })

  it('пустая очередь: поясняющее пустое состояние', async () => {
    setAuth()
    ;(assignmentsApi.mine as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const w = mount(AssessmentsView, { global: { stubs: { teleport: true } } })
    await settle()
    expect(w.find('[data-testid="empty-queue"]').text())
      .toContain('всё заполнено или переоценка ещё не запускалась')
  })
})

describe('AssignmentGuide: гайд «Как это работает» (14.1)', () => {
  it('рендерится свёрнутым, раскрывается и перечисляет типы заданий', async () => {
    const w = mount(AssignmentGuide)
    expect(w.find('[data-testid="assignment-guide"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Типы заданий:')
    await w.find('.guide-head').trigger('click')
    const text = w.text()
    for (const t of ['Самооценка', 'Оценка подчинённых', 'Селф-ревью', 'Оценка коллеги']) {
      expect(text).toContain(t)
    }
    expect(text).toContain('скоро')  // ОС — «скоро»
  })
})

describe('NotificationsView: диплинк url (9.1)', () => {
  beforeEach(() => { vi.clearAllMocks(); push.mockClear() })

  it('клик по непрочитанному с url — read-запрос и переход по адресу', async () => {
    setAuth()
    const w = mount(NotificationsView, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('.item').trigger('click')
    await settle()
    expect(notificationsApi.markRead).toHaveBeenCalledWith(1)
    expect(push).toHaveBeenCalledWith('/assessments')
  })
})

describe('CompetenciesTab: свежесть и системные значения (9.8–9.10)', () => {
  const perms = { edit_marks: true, is_self: false }
  const grades = [{ label: 'Старший 1', value: 'Старший 1' }]

  beforeEach(() => { vi.clearAllMocks(); push.mockClear() })

  it('счётчик полноты сессии и бейдж «N системой» из API-ответа (9.9)', async () => {
    setAuth()
    const w = mount(CompetenciesTab, { props: { employeeId: 5, perms, gradeOptions: grades } })
    await settle()
    expect(w.find('[data-testid="session-completeness"]').text())
      .toContain('15/20 пользователем')
    expect(w.text()).toContain('5 системой')
  })

  it('принудительное закрытие: кнопка у незакрытой сессии, уходит с телом (9.10)', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(CompetenciesTab, { props: { employeeId: 5, perms, gradeOptions: grades } })
    await settle()
    // сессия 20/20 пунктов версии — «закрытая», кнопки нет; делаем незакрытую
    ;(competenciesApi.sessions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { kind: 'soft', date: '2026-10-01', assessor_kind: 'manager', assessor: 'Рук',
        marks: 3, user_marks: 3, system_marks: 0, matrix_id: 9, version: 2, is_current: true },
    ])
    await w.vm.$forceUpdate()
    // перезагрузка через смену типа
    await w.findAllComponents({ name: 'SelectButton' })[0].vm.$emit('update:modelValue', 'soft')
    await settle()
    const btn = w.find('[data-testid="session-force-close"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await settle()
    expect(reassessmentApi.forceClose).toHaveBeenCalledWith({
      employee_id: 5, matrix_id: 9, assessor_kind: 'manager' })
  })

  it('подсказка даты и предупреждение о задней дате при открытом задании (9.8)', async () => {
    setAuth()
    const w = mount(CompetenciesTab, { props: { employeeId: 5, perms, gradeOptions: grades } })
    await settle()
    // открытое задание переоценки по этому сотруднику есть (mine → competency-self #2)
    await w.findAll('button').find((b) => b.text().includes('Внести разметку'))!.trigger('click')
    await settle()
    expect(w.find('[data-testid="date-freshness-hint"]').text())
      .toContain('дата влияет на свежесть оценки')
    // прошедшая дата существующей сессии → предупреждение
    const date = w.find('input[type="date"]')
    await date.setValue('2026-10-01')
    await settle()
    expect(w.find('[data-testid="stale-date-warning"]').text())
      .toContain('не закроет задание')
  })
})

describe('WorkflowSchema: значок заданий перехода (14.2)', () => {
  it('значок только у переходов с assignments; переход без поля — как раньше', async () => {
    setAuth()
    const w = mount(WorkflowSchema, { global: { stubs: { teleport: true } } })
    await settle()
    expect(reviewsApi.workflowSchema).toHaveBeenCalled()
    const badges = w.findAll('[data-testid="wf-assignment-badge"]')
    expect(badges.length).toBe(1)  // только start_self_review
    // значок открывает info с строкой заданий
    await badges[0].trigger('click')
    await settle()
    expect(w.find('[data-testid="wf-assignment-line"]').text())
      .toContain('Создаёт задания: карточка селф-ревью + переоценка компетенций')
  })
})
