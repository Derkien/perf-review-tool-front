import axios from 'axios'

export const api = axios.create({ baseURL: '/api/v1' })

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp != null && payload.exp * 1000 < Date.now()
  } catch {
    return false
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    if (tokenExpired(token)) {
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      window.dispatchEvent(new CustomEvent('prtool:session-expired'))
      location.replace(location.origin + '/#/login')
      throw new Error('сессия истекла')
    }
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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
  const full: ErrorEntry = {
    at: new Date().toISOString(),
    user: localStorage.getItem('me') ? JSON.parse(localStorage.getItem('me')!).email : undefined,
    route: location.hash,
    ...entry,
  }
  errorLog.unshift(full)
  if (errorLog.length > 50) errorLog.pop()
  window.dispatchEvent(new CustomEvent('prtool:error-logged', { detail: full }))
  // контекст в консоль —取证 для кибаны/сентри при подключении
  console.error('[prtool-error]', JSON.stringify(full))
}

export function getErrorLog(): ErrorEntry[] {
  return errorLog
}

function notifyApiError(message: string, url?: string, status?: number) {
  logError({ kind: 'api', message, url, status })
  window.dispatchEvent(new CustomEvent('prtool:api-error', { detail: { message, url } }))
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('me')
      if (!location.hash.includes('login')) {
        // replace: кнопка «назад» не должна вести на закрытый раздел
        location.replace(location.origin + '/#/login')
      }
    } else {
      const detail = err.response?.data?.detail
      const message = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d: any) => `${d?.loc?.join('.')}: ${d?.msg}`).join('; ')
        : err.message
      const url = err.config?.url ? String(err.config.url) : undefined
      notifyApiError(message, url, err.response?.status)
    }
    return Promise.reject(err)
  },
)

export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined
    if (typeof d?.detail === 'string') return d.detail
    if (Array.isArray(d?.detail)) return JSON.stringify(d.detail)
    return e.message
  }
  return String(e)
}
