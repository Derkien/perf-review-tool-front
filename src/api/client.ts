/** Контрактный HTTP-клиент: пути и типы строго из сгенерированной схемы.
 *  Ручных URL в прикладном коде быть не должно (docs/standards).
 *  Базовый URL настраивается VITE_API_BASE — при переносе админки за гейтвей
 *  достаточно env, код не меняется. */
import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'
import type { paths } from './types'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export const client = createClient<paths>({ baseUrl: API_BASE })

// auth: токен из localStorage + мгновенная реакция на протухание
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

function dropSession(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('me')
  onUnauthorized?.()
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
        dropSession()
        throw new Error('сессия истекла')
      }
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  onResponse({ response }) {
    // 401 от любого эндпоинта — сессия протухла на сервере (external-режим и т.п.)
    if (response.status === 401 && !location.hash.includes('login')) {
      dropSession()
    }
    return response
  },
}

client.use(authMiddleware)
