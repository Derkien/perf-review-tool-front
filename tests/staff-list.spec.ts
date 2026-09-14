import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// мок API-слоя и роутера/тостов для интеграционного теста страницы
vi.mock('../src/api/endpoints', () => ({
  reviewsApi: {
    cycles: vi.fn(async () => [
      { id: 7, name: 'Тест-цикл', stage: 'self-review' },
    ]),
    participants: vi.fn(async () => ({ cycle_id: 7, included_count: 2, excluded: [] })),
    excludeParticipants: vi.fn(async () => ({ cycle_id: 7, excluded: 1 })),
    includeParticipants: vi.fn(async () => ({ cycle_id: 7, included: 1 })),
    broadcast: vi.fn(async () => ({ sent: 1, template: 'custom' })),
    sendAssignments: vi.fn(async () => ({ created: 2, notified: 2 })),
  },
  staffApi: {
    listEmployees: vi.fn(async () => [
      { id: 1, full_name: 'Алёшин Алёша', functional_group: 'backend', grade: 'Основной 1',
        org_unit: 'Группа X', manager: 'Лидеров Лид' },
      { id: 2, full_name: 'Борисов Борис', functional_group: 'backend', grade: 'Основной 1',
        org_unit: 'Группа X', manager: 'Лидеров Лид' },
    ]),
  },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../src/composables/useAppConfirm', () => ({
  useAppConfirm: () => ({ state: { value: null }, ask: vi.fn(async () => 'причина') }),
}))

// v-tooltip не регистрируем — глушим предупреждения о директивах/компонентах
config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import StaffRowActions from '../src/components/StaffRowActions.vue'
import MassActionBar from '../src/components/MassActionBar.vue'
import StaffListView from '../src/views/StaffListView.vue'
import { reviewsApi, staffApi } from '../src/api/endpoints'
import { useAuth } from '../src/stores/auth'

function mountPage() {
  return mount(StaffListView, {
    global: { stubs: { teleport: true } },
  })
}

const ALL = {
  canToggleCycle: true, canBroadcast: true, canSend: true, sendWindow: true,
}

function rowProps(over = {}) {
  return { excluded: false, ...ALL, stageLabel: 'сбор ачивок', ...over }
}

describe('StaffRowActions (fixes8)', () => {
  it('показывает все действия при правах', () => {
    const w = mount(StaffRowActions, { props: rowProps() })
    expect(w.find('.pi-user').exists()).toBe(true)
    expect(w.find('.pi-users').exists()).toBe(true)
    expect(w.find('.pi-megaphone').exists()).toBe(true)
    expect(w.find('.pi-send').exists()).toBe(true)
    expect(w.find('.pi-ban').exists()).toBe(true) // не исключён → «исключить»
  })

  it('иконка меняется на «вернуть» для исключённого', async () => {
    const w = mount(StaffRowActions, { props: rowProps({ excluded: false }) })
    expect(w.find('.pi-ban').exists()).toBe(true)
    expect(w.find('.pi-user-plus').exists()).toBe(false)
    await w.setProps({ excluded: true })
    expect(w.find('.pi-ban').exists()).toBe(false)
    expect(w.find('.pi-user-plus').exists()).toBe(true)
  })

  it('скрывает действия без прав и вне окна стадий', () => {
    const w = mount(StaffRowActions, {
      props: rowProps({ canBroadcast: false, canToggleCycle: false, sendWindow: false }),
    })
    expect(w.find('.pi-megaphone').exists()).toBe(false)
    expect(w.find('.pi-ban').exists()).toBe(false)
    expect(w.find('.pi-user-plus').exists()).toBe(false)
    expect(w.find('.pi-send').exists()).toBe(false) // окно закрыто
  })

  it('клики эмитят действия', async () => {
    const w = mount(StaffRowActions, { props: rowProps() })
    await w.find('.pi-user').trigger('click') // всплывает к кнопке
    expect(w.emitted('profile')).toBeTruthy()
    await w.find('.pi-ban').trigger('click')
    expect(w.emitted('toggle-cycle')).toBeTruthy()
  })
})

describe('MassActionBar (fixes8)', () => {
  it('не рендерится без выбранных', () => {
    const w = mount(MassActionBar, { props: { count: 0, busy: false, ...ALL } })
    expect(w.find('.mass-bar').exists()).toBe(false)
  })

  it('показывает счётчик и действия при выборе', () => {
    const w = mount(MassActionBar, {
      props: { count: 3, busy: false, ...ALL, disabledInclude: false },
    })
    expect(w.find('.mass-bar').exists()).toBe(true)
    expect(w.find('.mass-count').text()).toContain('3')
    expect(w.text()).toContain('Исключить из цикла')
    expect(w.text()).toContain('Уведомить')
    expect(w.text()).toContain('Отправить задания на оценку')
    expect(w.text()).toContain('Снять выбор')
  })

  it('эмитит действия и очистку', async () => {
    const w = mount(MassActionBar, {
      props: { count: 1, busy: false, ...ALL, disabledInclude: false },
    })
    const excludeBtn = w.findAll('button').find((b) => b.text().includes('Исключить'))!
    await excludeBtn.trigger('click')
    expect(w.emitted('exclude')).toBeTruthy()
    await w.findAll('button').at(-1)!.trigger('click') // снять выбор
    expect(w.emitted('clear')).toBeTruthy()
  })
})

describe('StaffListView (fixes8: вёрстка и поведение)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 1, email: 'a@itgri.ru', full_name: 'A', role: 'admin', roles: ['admin'],
      permissions: ['ROLE_R_STAFF', 'ROLE_U_CYCLE_PARTICIPANTS', 'ROLE_C_CYCLE_BROADCAST',
                    'ROLE_C_PEER_ASSIGNMENT'],
      has_subordinates: true,
    } as any
  })

  it('фильтры — лаконичная шапка над таблицей (поиск/специализация/грейд/мои/участие)', async () => {
    const w = mountPage()
    await new Promise((r) => setTimeout(r, 20))
    const bar = w.find('.filter-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.find('input[placeholder="Поиск по ФИО / email"]').exists()).toBe(true)
    expect(w.text()).toContain('мои')
    expect(w.text()).toContain('В цикле')
    // масс-панель не рендерится без выбора — фильтры не пляшут
    expect(w.find('.mass-bar').exists()).toBe(false)
  })

  it('плавающая панель появляется только при выборе сотрудников', async () => {
    const w = mountPage()
    await new Promise((r) => setTimeout(r, 20))
    expect(w.find('.mass-bar').exists()).toBe(false)
    const vm: any = w.vm
    vm.selected = vm.rows
    await nextTick()
    expect(w.find('.mass-bar').exists()).toBe(true)
    expect(w.find('.mass-bar').text()).toContain('2')
  })

  it('единичное «исключить» вызывает API и обновляет состояние (иконка меняется)', async () => {
    const w = mountPage()
    await new Promise((r) => setTimeout(r, 20))
    const vm: any = w.vm
    expect(w.find('.pi-ban').exists()).toBe(true)
    window.prompt = () => 'причина'
    await vm.toggleCycleFor(vm.rows[0])
    expect(reviewsApi.excludeParticipants).toHaveBeenCalledWith(7, [1], 'причина')
    // после перезагрузки участников состояние актуально: включённый снова виден как «исключить»
    expect(staffApi.listEmployees).toHaveBeenCalled()
  })
})




describe('StaffListView: масс-действия из плавающей панели (клик → запрос)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    const auth = useAuth()
    auth.me = {
      id: 1, email: 'a@itgri.ru', full_name: 'A', role: 'admin', roles: ['admin'],
      permissions: ['ROLE_R_STAFF', 'ROLE_U_CYCLE_PARTICIPANTS', 'ROLE_C_CYCLE_BROADCAST',
                    'ROLE_C_PEER_ASSIGNMENT'],
      has_subordinates: true,
    } as any
  })

  async function mountAndSelect(w: any) {
    await new Promise((r) => setTimeout(r, 20))
    const vm: any = w.vm
    vm.selected = vm.baseRows
    await nextTick()
    return vm
  }

  it('«Исключить из цикла»: клик в панели шлёт запрос с id выбранных', async () => {
    const w = mountPage()
    await mountAndSelect(w)
    const btn = w.findAll('button').find((b) => b.text().includes('Исключить из цикла'))!
    expect(btn, 'кнопка исключения в плавающей панели').toBeTruthy()
    await btn.trigger('click')
    await new Promise((r) => setTimeout(r, 10))
    expect(reviewsApi.excludeParticipants).toHaveBeenCalledWith(
      7, [1, 2], expect.any(String))
  })

  it('«Вернуть в цикл»: клик шлёт запрос только по реально исключённым из выбранных', async () => {
    const w = mountPage()
    const vm = await mountAndSelect(w)
    // первый сотрудник исключён на сервере; кнопка активна в режиме «Исключены»
    vm.participantFilter = 'excluded'
    vm.excludedIds = new Set([1])
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text().includes('Вернуть в цикл'))!
    await btn.trigger('click')
    await new Promise((r) => setTimeout(r, 10))
    expect(reviewsApi.includeParticipants).toHaveBeenCalledWith(7, [1])
  })

  it('«Уведомить»: клик открывает диалог с ФИО выбранных', async () => {
    const w = mountPage()
    await mountAndSelect(w)
    const btn = w.findAll('button').find((b) => b.text() === 'Уведомить')!
    await btn.trigger('click')
    await nextTick()
    const vm: any = w.vm
    expect(vm.notifyTargets?.length).toBe(2)
    expect(vm.notifyNames).toContain('Алёшин')
  })

  it('«Отправить задания»: клик шлёт рассылку с id выбранных', async () => {
    const w = mountPage()
    const vm = await mountAndSelect(w)

    const btn = w.findAll('button').find((b) => b.text().includes('Отправить задания'))!
    await btn.trigger('click')
    await new Promise((r) => setTimeout(r, 50))
    expect(reviewsApi.sendAssignments).toHaveBeenCalledWith(
      { cycle_id: 7, employee_ids: [1, 2] })
  })
})
