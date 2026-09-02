/** Ошибки API и журнал ошибок сессии (для кнопки «Копировать всё» в топбаре).
 *  Работает и с контрактным клиентом (ApiError), и с нативными ошибками fetch. */

export class ApiError extends Error {
  status?: number
  url?: string
  detail?: unknown

  constructor(message: string, opts: { status?: number; url?: string; detail?: unknown } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status
    this.url = opts.url
    this.detail = opts.detail
  }

  get isNetwork(): boolean {
    return this.status === undefined || this.status >= 500
  }
}

// Журнал ошибок сессии: с контекстом (для копирования в поддержку/дебаг)
export interface ErrorEntry {
  at: string
  kind: 'api' | 'render' | 'unhandled'
  message: string
  url?: string
  status?: number
  user?: string
  route?: string
  context?: Record<string, unknown>
}
const errorLog: ErrorEntry[] = []

export function logError(entry: Omit<ErrorEntry, 'at'>) {
  const me = localStorage.getItem('me')
  const full: ErrorEntry = {
    at: new Date().toISOString(),
    user: me ? JSON.parse(me)?.email : undefined,
    route: location.hash,
    ...entry,
  }
  errorLog.unshift(full)
  if (errorLog.length > 50) errorLog.pop()
  window.dispatchEvent(new CustomEvent('prtool:error-logged', { detail: full }))
  // контекст в консоль — корсмы для кибаны/сентри при подключении
  console.error('[prtool-error]', JSON.stringify(full))
}

export function getErrorLog(): ErrorEntry[] {
  return errorLog
}

export function notifyApiError(message: string, url?: string, status?: number) {
  logError({ kind: 'api', message, url, status })
  window.dispatchEvent(new CustomEvent('prtool:api-error', { detail: { message, url } }))
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  const any = e as { response?: { data?: { detail?: unknown } }; message?: string }
  const d = any?.response?.data as { detail?: unknown } | undefined
  if (typeof d?.detail === 'string') return d.detail
  if (Array.isArray(d?.detail)) return JSON.stringify(d.detail)
  if (e instanceof Error) return e.message
  return String(e)
}
