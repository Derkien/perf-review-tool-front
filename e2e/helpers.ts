import type { APIRequestContext, Page } from '@playwright/test'

/** Тестовые пользователи e2e-мира (dev-режим; сотрудников создаёт scripts/seed_demo.py). */
export const USERS = {
  admin: { email: 'admin@itgri.ru', role: 'admin' },
  // android-сотрудник с историей разметок по архивной v1 (захардкожен в dev-логине)
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

/** Админский заголовок независимо от login() (нужен до захода в UI, например в beforeAll). */
export async function adminAuth(r: Page | APIRequestContext): Promise<{ Authorization: string }> {
  const req = 'request' in r ? r.request : r
  const resp = await req.post('/api/v1/auth/dev-token', {
    data: { email: USERS.admin.email, role: USERS.admin.role },
  })
  const { access_token } = (await resp.json()) as { access_token: string }
  return { Authorization: `Bearer ${access_token}` }
}

/** id сотрудника по email — e2e-мир создаётся сидом, id не хардкодятся.
 * Справочник кадров требует ROLE_R_STAFF — зовём админским токеном сами. */
export async function employeeId(r: Page | APIRequestContext, email: string): Promise<number> {
  const req = 'request' in r ? r.request : r
  const q = encodeURIComponent(email.split('@')[0])
  const resp = await req.get(`/api/v1/staff/employees?q=${q}&active=true`, {
    headers: await adminAuth(r),
  })
  const rows = (await resp.json()) as { id: number; email: string }[]
  const found = rows.find((row) => row.email === email) || rows[0]
  if (!found) throw new Error(`сотрудник не найден: ${email}`)
  return found.id
}
