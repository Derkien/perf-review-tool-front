import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { nextTick } from 'vue'

// Радар компетенций по категориям (change competency-grade-norms, задачи 4.1–4.3):
// полигон нормы в RadarChart, чипы категорий с детализацией, переключатель norm_grade.

const radarMock = vi.fn()
const setOptionMock = vi.fn()
const zrOnMock = vi.fn()

vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: setOptionMock,
    resize: vi.fn(),
    dispose: vi.fn(),
    getZr: () => ({ on: zrOnMock }),
  })),
}))

vi.mock('../src/api/endpoints', () => ({
  competenciesApi: {
    radar: (...args: unknown[]) => radarMock(...args),
    matrix: vi.fn(async () => []),
    sessions: vi.fn(async () => []),
    sessionDetail: vi.fn(async () => ({ rows: [], categories: { self: [], manager: [] } })),
    matrixItems: vi.fn(async () => []),
  },
  assignmentsApi: { mine: vi.fn(async () => []) },
  staffApi: { card: vi.fn(async () => ({ full_name: 'Тест', grade: 'Основной 1' })) },
  reviewsApi: { publicSettings: vi.fn(async () => ({ grades: [] })) },
  notificationsApi: { unreadCount: vi.fn(async () => ({ count: 0 })) },
}))
vi.mock('../src/api/errors', () => ({
  errMsg: (e: unknown) => String(e),
  ApiError: class extends Error {},
  notifyApiError: () => undefined,
}))

import RadarChart from '../src/components/RadarChart.vue'
import CompetenciesTab from '../src/components/CompetenciesTab.vue'
import { competenciesApi } from '../src/api/endpoints'

const RADAR = {
  axis: ['Языки', 'Инструменты', 'Одинокий пункт'],
  self: [3.5, null, 2],
  manager: [4, 3, null],
  norm: [3.5, 4, 3],
  norm_grade: 'Основной 1',
  categories: [
    { name: 'Языки', items: [
      { item_id: 1, name: 'Python', self: 4, manager: 5, norm: 3 },
      { item_id: 2, name: 'Go', self: 3, manager: 3, norm: 4 },
    ] },
    { name: 'Инструменты', items: [
      { item_id: 3, name: 'Docker', self: null, manager: 3, norm: 4 },
      { item_id: 4, name: 'Kubernetes', self: null, manager: null, norm: 4 },
    ] },
    { name: 'Одинокий пункт', items: [
      { item_id: 5, name: 'Читаемость кода', self: 2, manager: null, norm: 3 },
    ] },
  ],
  gaps: [],
  matrices: [{ id: 12, kind: 'hard', specialty: 'backend', version: 2 }],
  summary: { overestimated: [], growth_zones: [], avg_self: 3, avg_manager: 4 },
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  config.global.config.warnHandler = () => undefined
  config.global.plugins = [
    [PrimeVue, { theme: { preset: Aura } }],
    ToastService,
    ConfirmationService,
  ]
  radarMock.mockResolvedValue(structuredClone(RADAR))
})

// --- 4.1 RadarChart: оси-категории и полигон нормы ---

describe('RadarChart: категорийные оси и полигон нормы', () => {
  it('ось = категория; норма рисуется полигоном по осям, а не окружностью', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth',
      { configurable: true, get: () => 400 })
    mount(RadarChart, {
      props: { axis: RADAR.axis, self: RADAR.self, manager: RADAR.manager, norm: RADAR.norm },
    })
    await nextTick()
    expect(setOptionMock).toHaveBeenCalled()
    const option = setOptionMock.mock.calls[0][0]
    expect(option.radar.indicator.map((i: { name: string }) => i.name)).toEqual(RADAR.axis)
    const series = option.series as { name: string; data: { value: number[] }[] }[]
    const norm = series.find((s) => s.name === 'Норма грейда')
    // полигон, а не плоская окружность: значения нормы различаются по осям
    expect(norm!.data[0].value).toEqual(RADAR.norm)
  })

  it('скалярная норма разворачивается в окружность (все оси одним значением)', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth',
      { configurable: true, get: () => 400 })
    mount(RadarChart, { props: { axis: ['A', 'B'], norm: 5 } })
    await nextTick()
    const option = setOptionMock.mock.calls[0][0]
    const norm = (option.series as { name: string; data: { value: number[] }[] }[])
      .find((s) => s.name === 'Норма грейда')
    expect(norm!.data[0].value).toEqual([5, 5])
  })

  it('клик по зоне подписи оси (zrender) эмитит axis-click ближайшей оси', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth',
      { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight',
      { configurable: true, get: () => 340 })
    zrOnMock.mockClear()
    const w = mount(RadarChart, { props: { axis: ['A', 'B', 'C', 'D'], norm: [1, 2, 3, 4] } })
    await nextTick()
    const handler = zrOnMock.mock.calls.find(([ev]: unknown[]) => ev === 'click')![1]
    // раскладка осей как в echarts: 0-я сверху, далее ПРОТИВ часовой (clockwise:false)
    handler({ offsetX: 200, offsetY: 8 })    // верх — ось A
    handler({ offsetX: 8, offsetY: 170 })    // левый край — ось B (не D!)
    handler({ offsetX: 392, offsetY: 170 })  // правый край — ось D (не B!)
    expect(w.emitted('axis-click')!.map((a: unknown[]) => a[0])).toEqual(['A', 'B', 'D'])
    handler({ offsetX: 200, offsetY: 170 })  // центр — клик по данным, не выбор категории
    handler({ target: {} })                   // клик по интерактивному элементу (легенда/точка)
    expect(w.emitted('axis-click')).toHaveLength(3)
  })
})

// --- 4.2/4.3 CompetenciesTab: чипы, детализация, следующая степень ---

const RadarStub = defineComponent({
  name: 'RadarChart',
  props: ['axis', 'self', 'manager', 'norm', 'session1', 'session2',
    'session1Default', 'session2Default', 'height', 'width'],
  template: '<div class="radar-stub" :data-axis="JSON.stringify(axis)" :data-norm="JSON.stringify(norm)" />',
})

function mountTab() {
  return mount(CompetenciesTab, {
    props: {
      employeeId: 5,
      perms: { edit_marks: true, is_self: false },
      grade: 'Основной 1',
      gradeOptions: [
        { label: 'Основной 1', value: 'Основной 1' },
        { label: 'Старший 1', value: 'Старший 1' },
      ],
    },
    global: { stubs: { teleport: true, RadarChart: RadarStub } },
  })
}

async function settle() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('CompetenciesTab: категории и следующая степень', () => {
  it('чипы только у категорий из >1 пункта; клик открывает детализацию с теми же сериями',
    async () => {
      const w = mountTab()
      await settle()
      const chips = w.findAll('.cat-chip')
      // «Одинокий пункт» из одного пункта — детализация не предлагается
      expect(chips.map((c) => c.text())).toEqual(['Языки2', 'Инструменты2'])
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(false)
      await chips[0].trigger('click')
      const detail = w.find('[data-testid="cat-detail"]')
      expect(detail.exists()).toBe(true)
      const detailChart = detail.findComponent(RadarStub)
      expect(JSON.parse(detailChart.attributes('data-axis')!)).toEqual(['Python', 'Go'])
      expect(JSON.parse(detailChart.attributes('data-norm')!)).toEqual([3, 4])
      // повторный клик закрывает
      await w.find('.cat-chip.active').trigger('click')
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(false)
    })

  it('клик по подписи оси на радаре открывает детализацию (повторный — закрывает)',
    async () => {
      const w = mountTab()
      await settle()
      const mainChart = w.find('.comp-radar').findComponent(RadarStub)
      await mainChart.vm.$emit('axis-click', 'Языки')
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(true)
      await mainChart.vm.$emit('axis-click', 'Языки')  // повторный — закрывает
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(false)
      await mainChart.vm.$emit('axis-click', 'Одинокий пункт')  // 1 пункт — не открывается
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(false)
      await mainChart.vm.$emit('axis-click', 'Самооценка')  // не категория — игнор
      expect(w.find('[data-testid="cat-detail"]').exists()).toBe(false)
    })

  it('переключатель «следующая степень» шлёт norm_grade грейда N+1', async () => {
    const w = mountTab()
    await settle()
    expect(radarMock).toHaveBeenCalledWith(5, 'hard', undefined, undefined)
    const toggle = w.find('[data-testid="norm-grade-toggle"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('Старший 1')
    await toggle.findAll('button')[1].trigger('click')
    await settle()
    expect(radarMock).toHaveBeenLastCalledWith(5, 'hard', undefined, 'Старший 1')
  })

  it('без следующего грейда (Ключевой 2) переключателя нет', async () => {
    const w = mount(CompetenciesTab, {
      props: {
        employeeId: 5,
        perms: {},
        grade: 'Ключевой 2',
        gradeOptions: [{ label: 'Ключевой 2', value: 'Ключевой 2' }],
      },
      global: { stubs: { teleport: true, RadarChart: RadarStub } },
    })
    await settle()
    expect(w.find('[data-testid="norm-grade-toggle"]').exists()).toBe(false)
  })
})
