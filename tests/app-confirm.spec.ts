import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { nextTick } from 'vue'

vi.mock('../src/api/endpoints', () => ({ reviewsApi: { cycles: vi.fn(async () => []) } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

config.global.plugins = [[PrimeVue, { theme: { preset: Aura } }]]
config.global.config.warnHandler = () => undefined

import AppConfirmDialog from '../src/components/AppConfirmDialog.vue'
import { useAppConfirm } from '../src/composables/useAppConfirm'

function mountDialog() {
  return mount(AppConfirmDialog, { global: { stubs: { teleport: true } } })
}

describe('AppConfirmDialog (fixes9)', () => {
  beforeEach(() => {
    const { state } = useAppConfirm()
    state.value = null
  })

  it('модалка с инпутом: ОК возвращает значение, тело видно', async () => {
    const { state, ask } = useAppConfirm()
    const w = mountDialog()
    const promise = ask({ header: 'Исключить из цикла', inputLabel: 'Причина (необязательно)' })
    await nextTick()
    const html = w.html()
    expect(html).toContain('Исключить из цикла')
    expect(html).toContain('Причина')
    const input = w.find('input[type="text"], input:not([type])')
    await input.setValue('новичок')
    const ok = w.findAll('button').find((b) => b.text() === 'ОК')!
    await ok.trigger('click')
    expect(await promise).toBe('новичок')
  })

  it('Отмена — null: действие не выполняется', async () => {
    const { state, ask } = useAppConfirm()
    const w = mountDialog()
    const promise = ask({ header: 'Удалить?', okLabel: 'Удалить' })
    await nextTick()
    const cancel = w.findAll('button').find((b) => b.text() === 'Отмена')!
    await cancel.trigger('click')
    expect(await promise).toBeNull()
    expect(w.find('.p-dialog').exists()).toBe(false) // модалка закрылась
  })

  it('выбор варианта (choices): ОК отдаёт выбранное, без выбора — ОК заблокирован', async () => {
    const { state, ask } = useAppConfirm()
    const w = mountDialog()
    const promise = ask({
      header: 'Удалить разметку?',
      choices: [{ label: 'Скрыть (soft)', value: 'soft' }, { label: 'Удалить навсегда', value: 'hard' }],
    })
    await nextTick()
    const ok = w.findAll('button').find((b) => b.text() === 'ОК')!
    expect(ok.attributes('disabled')).toBeDefined() // ничего не выбрано
    const hard = w.findAll('button').find((b) => b.text().includes('Удалить навсегда'))!
    await hard.trigger('click')
    await nextTick()
    await w.findAll('button').find((b) => b.text() === 'ОК')!.trigger('click')
    expect(await promise).toBe('hard')
  })
})
