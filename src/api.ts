import axios from 'axios'

export const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function notifyApiError(message: string, url?: string) {
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
        : Array.isArray(detail) ? detail.map((d: any) => d?.msg).join('; ')
        : err.message
      const url = err.config?.url ? String(err.config.url) : undefined
      notifyApiError(message, url)
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
