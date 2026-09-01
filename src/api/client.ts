/** Контрактный HTTP-клиент: пути и типы строго из сгенерированной схемы.
 *  Ручных URL в прикладном коде быть не должно (KnowledgeBase/00-ROLE-&-MINDSET). */
import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'
import type { paths } from './types'

export const client = createClient<paths>({ baseUrl: '' })

// auth: токен из localStorage + мгновенная реакция на протухание
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp != null && payload.exp * 1000 < Date.now()
  } catch {
    return false
  }
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = localStorage.getItem('token')
    if (token) {
      if (tokenExpired(token)) {
        localStorage.removeItem('token')
        localStorage.removeItem('me')
        onUnauthorized?.()
        throw new Error('сессия истекла')
      }
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
}

client.use(authMiddleware)
