import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'

config.global.config.warnHandler = () => undefined
config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]

import { defineComponent, h, ref } from 'vue'
import Column from 'primevue/column'
import AppTable from '../src/components/AppTable.vue'

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Строка ${i + 1}` }))
}

describe('AppTable: системный компонент таблиц', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('≤20 строк — пагинатор скрыт; >20 — показан (авто-правило)', async () => {
    const small = mount(AppTable, { props: { value: rows(5), tableTestid: 't1' },
      slots: { default: () => h(Column, { field: 'name', header: 'N' }) } })
    expect(small.find('.p-paginator').exists()).toBe(false)
    expect(small.find('[data-testid="t1-empty"]').exists()).toBe(false)

    const big = mount(AppTable, { props: { value: rows(21), tableTestid: 't2' },
      slots: { default: () => h(Column, { field: 'name', header: 'N' }) } })
    expect(big.find('.p-paginator').exists()).toBe(true)
    expect(big.text()).toContain('1–20 из 21')
  })

  it('пустое значение — заглушка «Нет данных» (пагинатора нет)', () => {
    const w = mount(AppTable, { props: { value: [], tableTestid: 't3' },
      slots: { default: () => h(Column, { field: 'name', header: 'N' }) } })
    expect(w.find('[data-testid="t3-empty"]').text()).toBe('Нет данных')
    expect(w.find('.p-paginator').exists()).toBe(false)
  })

  it('строка фильтров — слот + счётчик строк', () => {
    const w = mount(AppTable, {
      props: { value: rows(7), tableTestid: 't4' },
      slots: {
        default: () => h(Column, { field: 'name', header: 'N' }),
        filters: () => h('input', { placeholder: 'поиск' }),
      },
    })
    expect(w.find('.app-table-filters input').exists()).toBe(true)
    expect(w.find('.app-table-count').text()).toBe('строк: 7')
  })

  it('выбор по ключам: чекбокс строки кликом, select-all с indeterminate', async () => {
    const selected = ref(new Set<string>(['2']))
    const toggle = (k: string) => {
      const n = new Set(selected.value)
      n.has(k) ? n.delete(k) : n.add(k)
      selected.value = n
    }
    const host = defineComponent({
      setup: () => () => h(AppTable, {
        value: rows(3), rowKey: 'id', tableTestid: 't5',
        selectedKeys: selected.value, onToggleKey: toggle,
      }, () => [h(Column, { field: 'name', header: 'N' })]),
    })
    const w = mount(host)
    // клик по чекбоксу строки 1 → emit toggle-key
    await w.find('[data-testid="t5-check-1"]').find('input').trigger('change')
    expect(selected.value.has('1')).toBe(true)
    expect(selected.value.has('2')).toBe(true)   // прежний выбор живёт
    // indeterminate на select-all (выбраны не все)
    expect(w.find('[data-testid="t5-check-all"]').attributes('data-p-indeterminate')).toBeDefined()
  })

  it('без selectedKeys колонки выбора нет', () => {
    const w = mount(AppTable, { props: { value: rows(2), tableTestid: 't6' },
      slots: { default: () => h(Column, { field: 'name', header: 'N' }) } })
    expect(w.find('[data-testid="t6-check-1"]').exists()).toBe(false)
  })
})
