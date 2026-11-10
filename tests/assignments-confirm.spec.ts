import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'

// подтверждения — через РЕАЛЬНУЮ модалку (useAppConfirm не мокаем; память: тесты
// модалки отдельно от моков композабла). Мокаем только API-слой.
vi.mock('../src/api/endpoints', () => ({
  reassessmentApi: {
    preview: vi.fn(async () => ({
      selected: 3, freshness_days: 30,
      created: { 'competency-self': 3, 'competency-manager-soft': 0, 'competency-manager-hard': 0 },
      skipped: {},
    })),
    launch: vi.fn(async () => ({
      launch_id: 8, selected: 3, preexisting_open: 0,
      created: { 'competency-self': 3, 'competency-manager-soft': 0, 'competency-manager-hard': 0 },
      skipped: {},
    })),
    launches: vi.fn(async () => []), cancelLaunch: vi.fn(), forceClose: vi.fn(),
  },
  adminAssignmentsApi: {
    list: vi.fn(async () => ({
      total: 2, kind_titles: {},
      items: [
        { id: 21, kind: 'competency-self', kind_title: 'Самооценка', status: 'notified',
          due_date: null, overdue: false, assignee: { id: 5, name: 'Иванов И.И.' },
          subject: { id: 5, name: 'Иванов И.И.' }, context: {},
          created_at: null, done_at: null, launch_id: null, progress: { matrices: [] } },
        { id: 22, kind: 'competency-self', kind_title: 'Самооценка', status: 'notified',
          due_date: null, overdue: false, assignee: { id: 6, name: 'Сидоров С.С.' },
          subject: { id: 6, name: 'Сидоров С.С.' }, context: {},
          created_at: null, done_at: null, launch_id: null, progress: { matrices: [] } },
      ],
    })),
    cancel: vi.fn(async () => ({ ok: true })),
    remind: vi.fn(async () => ({ ok: true, sent: 1 })),
    bulk: vi.fn(async () => ({ ok: true, requested: 2, applied: 2 })),
  },
  staffApi: {
    listEmployees: vi.fn(async () => []),
    orgUnits: vi.fn(async () => []),
  },
  notificationsApi: { unreadCount: vi.fn(async () => ({ count: 0, open_assignments: 0 })) },
  trackAction: vi.fn(),
  errMsg: (e: unknown) => String((e as Error)?.message || e),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/admin' }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import ReassessmentTab from '../src/components/ReassessmentTab.vue'
import AdminAssignmentsTab from '../src/components/AdminAssignmentsTab.vue'
import AppConfirmDialog from '../src/components/AppConfirmDialog.vue'
import { reassessmentApi, adminAssignmentsApi } from '../src/api/endpoints'
import { useAppConfirm } from '../src/composables/useAppConfirm'
import { useAuth } from '../src/stores/auth'

async function settle(ms = 30) {
  await new Promise((r) => setTimeout(r, ms))
}

function setAuth(perms: string[]) {
  setActivePinia(createPinia())
  const auth = useAuth()
  auth.me = { id: 1, email: 'a@x.ru', full_name: 'A', role: 'admin', roles: ['admin'],
              permissions: perms, has_subordinates: true } as any
}

const WithDialog = defineComponent({
  render: () => h('div', [h(ReassessmentTab), h(AppConfirmDialog)]),
})
const RegistryWithDialog = defineComponent({
  render: () => h('div', [h(AdminAssignmentsTab), h(AppConfirmDialog)]),
})

async function clickModalButton(w: ReturnType<typeof mount>, label: string) {
  // ищем только внутри модалки: «Отмена» есть и в строках таблицы
  const btn = w.find('.p-dialog').findAll('button').find((b) => b.text() === label)
  expect(btn, `кнопка «${label}» модалки`).toBeTruthy()
  await btn!.trigger('click')
  await settle()
}

describe('модалки подтверждения контура заданий (9.2/13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppConfirm().state.value = null
  })

  it('запуск переоценки: модалка с объектом действия; отмена ничего не отправляет', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(WithDialog, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('[data-testid="btn-preview"]').trigger('click')
    await settle()
    await w.find('[data-testid="btn-launch"]').trigger('click')
    await nextTick()

    const modal = w.find('.p-dialog')
    expect(modal.exists()).toBe(true)
    const text = modal.text()
    expect(text).toContain('Кого: 3 в выборке (3 получат задания)')
    expect(text).toContain('Дедлайн: без срока')
    expect(text).toContain('Окно свежести: 30 дн.')
    expect(text).toContain('Запустить')

    await clickModalButton(w, 'Отмена')
    expect(reassessmentApi.launch).not.toHaveBeenCalled()
  })

  it('запуск переоценки: ОК отправляет launch', async () => {
    setAuth(['ROLE_U_COMPETENCY_REASSESSMENT'])
    const w = mount(WithDialog, { global: { stubs: { teleport: true } } })
    await settle()
    await w.find('[data-testid="btn-preview"]').trigger('click')
    await settle()
    await w.find('[data-testid="btn-launch"]').trigger('click')
    await nextTick()
    await clickModalButton(w, 'Запустить')
    expect(reassessmentApi.launch).toHaveBeenCalled()
  })

  it('массовая отмена заданий: «Что/Кому» в модалке; ОК шлёт bulk с точными id', async () => {
    setAuth(['ROLE_U_ASSIGNMENTS'])
    const w = mount(RegistryWithDialog, { global: { stubs: { teleport: true } } })
    await settle()
    // выбрать обе строки чекбоксами таблицы
    const boxes = w.findAll('input[type="checkbox"]')
    for (const b of boxes) await b.setValue(true)
    await settle()
    await w.find('[data-testid="bulk-cancel"]').trigger('click')
    await nextTick()

    const text = w.find('.p-dialog').text()
    expect(text).toContain('отмена 2 заданий')
    expect(text).toContain('Иванов И.И., Сидоров С.С.')
    await clickModalButton(w, 'Отменить')
    expect(adminAssignmentsApi.bulk).toHaveBeenCalledWith('cancel', [21, 22])
  })
})
