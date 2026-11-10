import type { Page } from '@playwright/test'

/** Тестовые пользователи стенда (dev-режим; создаются scripts/seed_test_users.py в api-репо). */
export const USERS = {
  admin: { email: 'admin@itgri.ru', role: 'admin' },
  // android-сотрудник с историей разметок по активной v1 (захардкожен в dev-логине)
  employee: { email: 'dziuba_v_s@itgri.ru', role: 'employee' },
}

/**
 * Логин через dev-режим без UI: dev-token + me кладём в localStorage
 * (тот же контракт, что у auth.devLogin из LoginView).
 */
export async function login(page: Page, user: { email: string; role: string }) {
  const tokenResp = await page.request.post('/api/v1/auth/dev-token', {
    data: { email: user.email, role: user.role },
  })
  if (!tokenResp.ok()) throw new Error(`dev-token ${user.email}: HTTP ${tokenResp.status()}`)
  const { access_token } = (await tokenResp.json()) as { access_token: string }
  authToken = access_token
  const meResp = await page.request.get('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!meResp.ok()) throw new Error(`auth/me ${user.email}: HTTP ${meResp.status()}`)
  const me = await meResp.json()
  await page.addInitScript(
    ({ t, m }) => {
      localStorage.setItem('token', t)
      localStorage.setItem('me', JSON.stringify(m))
    },
    { t: access_token, m: me },
  )
}

/** Токен последнего login() — для прямых API-запросов из теста. */
let authToken = ''

export function apiAuth(): { Authorization: string } {
  return { Authorization: `Bearer ${authToken}` }
}

/** id сотрудника по email (справочник кадров требует ROLE_R_STAFF — зовём админским токеном). */
export async function employeeId(page: Page, email: string): Promise<number> {
  const q = encodeURIComponent(email.split('@')[0])
  const resp = await page.request.get(`/api/v1/staff/employees?q=${q}&active=true`, {
    headers: apiAuth(),
  })
  const rows = (await resp.json()) as { id: number; email: string }[]
  const found = rows.find((r) => r.email === email) || rows[0]
  if (!found) throw new Error(`сотрудник не найден: ${email}`)
  return found.id
}
