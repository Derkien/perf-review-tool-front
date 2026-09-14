/** Модальные подтверждения действий (fixes9): вместо window.prompt/confirm/alert.
 *  ask() возвращает Promise: строка-значение/выбранный вариант при ОК, null при отмене.
 *  Синглтон-состояние монтируется компонентом AppConfirmDialog в AppLayout. */
import { ref } from 'vue'

export type ConfirmChoice = { label: string; value: string }

export type ConfirmOptions = {
  header: string
  message?: string
  /** однострочный инпут (например, причина действия; может быть необязательным) */
  inputLabel?: string
  inputPlaceholder?: string
  /** выбор варианта (радио-кнопками) вместо инпута */
  choices?: ConfirmChoice[]
  okLabel?: string
  danger?: boolean
}

export type ConfirmState = ConfirmOptions & { resolve: (v: string | null) => void }

const state = ref<ConfirmState | null>(null)

/** Открыть модалку подтверждения. null = отмена, иначе — значение инпута/выбора. */
function ask(options: ConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => {
    state.value = { ...options, resolve }
  })
}

export function useAppConfirm() {
  return { state, ask }
}
