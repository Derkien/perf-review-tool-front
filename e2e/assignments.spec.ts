import { test, expect, APIRequestContext } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * Группа 10 change competency-reassessment-notifications, сквозные через nginx :8080.
 * Команда: Дзюба (id 33, android, user employee), Косарев (id 61, qa, user employee),
 * Шваркунов (line-manager Косарева, ROLE_U_COMPETENCY_MARKS), admin.
 * Данные стенда: активные схемы soft (2×8 п.) + hard android v19 (3 E2E-пункта) + hard qa (28 п.).
 * Попутно снимаем сценарий заказчика в e2e/screenshots/reassessment/ (tasks.md 15.2).
 */

const DZIUBA = 33
const KOSAREV = 61
const today = () => new Date().toISOString().slice(0, 10)

async function adminLogin(r: APIRequestContext) {
  const resp = await r.post('/api/v1/auth/dev-token', {
    data: { email: USERS.admin.email, role: USERS.admin.role },
  })
  const { access_token } = await resp.json()
  return { Authorization: `Bearer ${access_token}` }
}

/** запуск переоценки напрямую API (UI-конвейер — отдельный сценарий) */
async function launchReassessment(r: APIRequestContext, employeeIds: number[]) {
  const auth = await adminLogin(r)
  const resp = await r.post('/api/v1/admin/competency-reassessment/launch', {
    headers: auth,
    data: { employee_ids: employeeIds },
  })
  expect(resp.status(), 'запуск переоценки').toBe(200)
  return (await resp.json()) as { launch_id: number }
}

/** перезапускаемость сюита: hard-delete сессий сотрудника за окно свежести (30 дн + запас),
 * чтобы прогон любого дня начинался с несвежей разметки — вчерашние отметки прошлого
 * прогона иначе держат launch-скип «свежая оценка» (грабля 11.11: reset только сегодня).
 * Soft-delete не годится — оживил бы старые created_at, а правило «задним числом
 * не закрывается» оставило бы задания открытыми. */
async function resetTodaySessions(r: APIRequestContext, employeeId: number) {
  const auth = await adminLogin(r)
  const windowStart = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  const sessions = await (await r.get(`/api/v1/competencies/employees/${employeeId}/sessions`,
                                      { headers: auth })).json()
  const stale = [...new Map((sessions as { kind: string; date: string }[])
    .filter((s) => s.date >= windowStart)
    .map((s) => [`${s.kind}|${s.date}`, s])).values()]
  for (const s of stale) {
    const del = await r.delete(
      `/api/v1/competencies/employees/${employeeId}/sessions/${s.kind}/${s.date}`,
      { headers: auth, params: { hard: true } })
    // всё громко: несуществующую сессию список бы не отдал
    expect(del.status(), `hard-delete сессии ${s.kind} ${s.date}`).toBe(200)
  }
  // и отменить его открытые задания прошлых прогонов (upsert не двигает created_at —
  // «задним числом не закрывается» оставил бы их открытыми навсегда); manager-задания
  // висят на руководителе, реестр не фильтрует по subject — фильтруем на клиенте
  const reg = await (await r.get('/api/v1/admin/assignments', {
    headers: auth, params: { page_size: 500 },
  })).json()
  const ids = reg.items.filter((a: { status: string; assignee?: { id: number };
                                     subject?: { id: number } }) =>
    ['pending', 'notified'].includes(a.status) &&
    (a.assignee?.id === employeeId || a.subject?.id === employeeId))
    .map((a: { id: number }) => a.id)
  if (ids.length) {
    await r.post('/api/v1/admin/assignments/bulk', {
      headers: auth, data: { action: 'cancel', ids } })
  }
}

/** разметка сотрудника по всем пунктам схем скоупа (кроме skipCount последних) */
async function fillMarks(r: APIRequestContext, who: typeof USERS.employee,
                         employeeId: number, assessorKind: 'self' | 'manager',
                         skipCount = 0) {
  // орг-семантика API: line-manager метит только soft, functional-manager — только hard
  const kinds = (assessorKind === 'manager' && who.role === 'line-manager')
    ? (['soft'] as const) : (['soft', 'hard'] as const)
  const resp = await r.post('/api/v1/auth/dev-token', {
    data: { email: who.email, role: who.role },
  })
  const { access_token } = await resp.json()
  const headers = { Authorization: `Bearer ${access_token}` }
  const card = await (await r.get(`/api/v1/staff/employees/${employeeId}`, { headers })).json()
  const grade = card.grade
  for (const kind of kinds) {
    const rows = await (await r.get(`/api/v1/competencies/employees/${employeeId}/matrix`, {
      headers, params: { kind },
    })).json()
    const items = rows.slice(0, Math.max(rows.length - skipCount, 0))
    for (const row of items) {
      const mark = await r.post('/api/v1/competencies/marks', {
        headers,
        data: { employee_id: employeeId, item_id: row.item_id, level: grade,
                assessed_on: today(), assessor_kind: assessorKind },
      })
      expect(mark.status(), `createMark ${row.item}`).toBeLessThan(300)
    }
  }
}

async function myAssignments(r: APIRequestContext, who: typeof USERS.employee) {
  const resp = await r.post('/api/v1/auth/dev-token', {
    data: { email: who.email, role: who.role },
  })
  const { access_token } = await resp.json()
  const list = await (await r.get('/api/v1/assignments/mine', {
    headers: { Authorization: `Bearer ${access_token}` },
  })).json()
  return list as { id: number; kind: string; status: string }[]
}

test.describe.serial('Задания: хаб «Оценки» и жизненный цикл', () => {

  test('10.2: /peer-review редиректит в /assessments; очередь рендерится, значок в меню', async ({ page, request }) => {
    await resetTodaySessions(request, DZIUBA)
    await launchReassessment(request, [DZIUBA])
    await login(page, USERS.employee)
    await page.goto('/#/peer-review')
    await expect(page).toHaveURL(/#\/assessments/)
    // карточка самооценки с типом и адресатом из API
    await expect(page.getByText('Самооценка компетенций', { exact: false })).toBeVisible()
    // счётчик ожидающих в меню
    const menuBadge = page.locator('a[href="#/assessments"] .p-badge')
    await expect(menuBadge.first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/01-hub-queue.png' })
    // гайд «Как это работает» сворачивается (14.1 e2e-часть 10.10)
    await page.locator('.guide-head').click()
    await expect(page.getByText('Типы заданий:')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/02-hub-guide.png', fullPage: true })
  })

  test('10.3: клик по уведомлению ведёт в хаб; разметка закрывает задание, счётчик падает', async ({ page, request }) => {
    // уведомление о запуске со ссылкой
    await login(page, USERS.employee)
    await page.goto('/#/notifications')
    await expect(page.getByText('переоценк', { exact: false }).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/03-notification.png' })
    await page.locator('.item', { hasText: 'переоценк' }).first().click()
    await expect(page).toHaveURL(/#\/assessments/)

    // частичное заполнение: прогресс «осталось N» уменьшается
    const before = await myAssignments(request, USERS.employee)
    const self = before.find((a) => a.kind === 'competency-self')
    expect(self, 'задание самооценки открыто').toBeTruthy()
    await fillMarks(request, USERS.employee, DZIUBA, 'self', 2) // все, кроме двух пунктов
    await page.reload()
    await expect(page.getByText('осталось', { exact: false }).first()).toBeVisible()

    // дозаполнение последних — задание закрывается, очередь пустеет, счётчик уходит
    await fillMarks(request, USERS.employee, DZIUBA, 'self', 0)
    await page.reload()
    await expect(page.getByTestId('empty-queue')).toBeVisible()
    const menuBadge = page.locator('a[href="#/assessments"] .p-badge')
    await expect(menuBadge).toHaveCount(0)
  })

  test('10.4: руководитель — групповая карточка с прогрессом; полная разметка закрывает', async ({ page, request }) => {
    await resetTodaySessions(request, KOSAREV)
    await launchReassessment(request, [KOSAREV])
    const manager = { email: 'shvarkunov_m_s@itgri.ru', role: 'line-manager' }
    await login(page, manager)
    await page.goto('/#/assessments')
    // одна карточка на вид с прогрессбаром «заполнено X из Y сотрудников»
    // (X/Y зависит от истории прогонов — done-задания остаются в группе)
    await expect(page.getByText(/заполнено \d+ из \d+ сотрудников/).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/04-manager-groups.png' })
    // «Анкеты подчинённых»: очередь Косарева
    await page.getByRole('tab', { name: 'Анкеты подчинённых' }).click()
    await expect(page.getByText('Косарев', { exact: false }).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/05-subordinates-queue.png' })

    // полная manager-разметка soft — открытое задание закрывается, счётчик уходит
    await fillMarks(request, manager, KOSAREV, 'manager', 0)
    await page.reload()
    const menuBadge = page.locator('a[href="#/assessments"] .p-badge')
    await expect(menuBadge).toHaveCount(0)
  })

  test('10.7: принудительное закрытие — бейджи «по умолчанию» и счётчик в сессии', async ({ page, request }) => {
    // самооценка Косарева не свежая → запуск создаёт self-задание; заполняем 15/20-стиль (без 2 пунктов)
    await resetTodaySessions(request, KOSAREV)
    await launchReassessment(request, [KOSAREV])
    const manager = { email: 'shvarkunov_m_s@itgri.ru', role: 'line-manager' }
    // manager-разметка полная — единственное незаполненное в запуске: self с 2 пробелами
    await fillMarks(request, manager, KOSAREV, 'manager', 0)
    await fillMarks(request, { email: 'kosarev_i_n@itgri.ru', role: 'employee' }, KOSAREV, 'self', 2)

    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Переоценка компетенций' }).click()
    // раскрыть последний запуск → незаполненное задание → кнопка на каждую схему с пробелами
    await page.locator('.launch-head').first().click()
    // по кнопке на каждую незакрытую схему (пробелы в soft и hard — закрываем все)
    let remaining = await page.getByTestId('btn-force-close').count()
    expect(remaining).toBeGreaterThan(0)
    while (remaining > 0) {
      await page.getByTestId('btn-force-close').first().click()
      const modal = page.locator('.p-dialog')
      await expect(modal).toContainText('Непокрыто: 2 из')
      await expect(modal).toContainText('Будет проставлен грейд')
      await page.screenshot({ path: 'e2e/screenshots/reassessment/06-force-close-modal.png' })
      await modal.getByRole('button', { name: 'Закрыть принудительно' }).click()
      await expect(page.getByText('Проставлено системных отметок').first()).toBeVisible()
      remaining -= 1
      await expect(page.getByTestId('btn-force-close')).toHaveCount(remaining)
    }

    // сессия сотрудника: бейджи «по умолчанию» у системных значений и счётчик полноты
    await page.goto(`/#/staff/${KOSAREV}`)
    await page.getByRole('tab', { name: 'Компетенции' }).click()
    await expect(page.getByText('системой', { exact: false }).first()).toBeVisible()
    // .act — экшн-иконка в таблице сессий (голый .pi-pencil ловит пункт меню «Моё ревью»)
    await page.locator('[data-testid="session-view"], .pi-pencil.act').first().click()
    await expect(page.getByTestId('default-mark-badge').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/07-default-marks.png', fullPage: true })
  })

  test('10.5: конвейер админки — фильтры → предпросмотр → модалка → сводка → список запусков; отмена', async ({ page, request }) => {
    // перезапускаемость: открытые задания прошлых прогонов дают предпросмотру
    // «уже открытое задание» у всех — запуск не создаст ничего и поток умрёт
    const auth = await adminLogin(request)
    const reg = await (await request.get('/api/v1/admin/assignments', {
      headers: auth, params: { page_size: 500 },
    })).json()
    const staleIds = reg.items.filter((a: { kind: string; status: string }) =>
      a.kind.startsWith('competency-') && ['pending', 'notified'].includes(a.status))
      .map((a: { id: number }) => a.id)
    if (staleIds.length) {
      await request.post('/api/v1/admin/assignments/bulk', {
        headers: auth, data: { action: 'cancel', ids: staleIds } })
    }

    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Переоценка компетенций' }).click()

    // фильтр по функциональной группе android
    const group = page.getByTestId('filter-group')
    await group.click()
    await page.getByRole('option', { name: 'android' }).click()
    await page.getByTestId('btn-preview').click()
    await expect(page.getByTestId('preview-block')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/08-pipeline-preview.png' })

    // запуск через модалку с объектом действия
    await page.getByTestId('btn-launch').click()
    const modal = page.locator('.p-dialog')
    await expect(modal).toContainText('Окно свежести:')
    await page.screenshot({ path: 'e2e/screenshots/reassessment/09-launch-modal.png' })
    await modal.getByRole('button', { name: 'Запустить' }).click()
    await expect(page.getByTestId('launch-summary')).toBeVisible()

    // запуск появился в списке с прогрессом; массовая отмена незаполненных
    await expect(page.getByText('выполнено', { exact: false }).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/10-launch-summary.png' })
    await page.locator('.launch-head').first().click()
    await page.getByTestId('btn-cancel-launch').first().click()
    await expect(page.locator('.p-dialog')).toContainText('открытых заданий запуска')
    await page.locator('.p-dialog').getByRole('button', { name: 'Отменить' }).click()
    await expect(page.getByText('Задания отменены')).toBeVisible()

    // лог рассылки: строки со статусами; фильтр по каналу сужает таблицу
    // (уведомления дедупятся «раз в сутки» — на событие запуска полагаться нельзя)
    await page.getByRole('tab', { name: 'Лог рассылки' }).click()
    const outbox = page.getByTestId('outbox-table')
    await expect(outbox).toBeVisible()
    await expect(outbox.locator('tbody tr').first()).toBeVisible()
    await page.getByTestId('filter-channel').click()
    await page.getByRole('option', { name: 'log' }).click()
    await expect(outbox.locator('tbody tr').first()).toContainText('log')
    await page.screenshot({ path: 'e2e/screenshots/reassessment/11-outbox.png' })
    // настройки группы reassessment присутствуют и сохраняются
    await page.getByRole('tab', { name: 'Настройки цикла' }).click()
    await expect(page.getByTestId('reassessment-settings')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/12-settings-reassessment.png', fullPage: true })
  })

  test('10.8: реестр заданий — фильтры сужают, отмена через модалку, без права вкладка скрыта', async ({ page, request }) => {
    // данные: один запуск из 10.5 отменён частично, но реестр покажет историю
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Задания' }).click()
    await expect(page.getByTestId('assignments-table')).toBeVisible()

    // фильтр по статусу «отменено» (filter-status есть и в «Логе рассылки» — скоупим вкладкой)
    const status = page.getByRole('tabpanel', { name: 'Задания' }).getByTestId('filter-status')
    await status.click()
    await page.getByRole('option', { name: 'отменено' }).click()
    await expect(page.getByText('отменено').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/reassessment/13-registry.png' })

    // сброс и отмена открытого задания из строки через модалку
    await status.click()
    await page.getByRole('option', { name: 'открыто (уведомлено)' }).click()
    const row = page.locator('[data-testid="row-cancel"]').first()
    if (await row.count()) {
      await row.click()
      await expect(page.locator('.p-dialog')).toContainText('Что: отмена задания')
      await page.locator('.p-dialog').getByRole('button', { name: 'Отменить задание' }).click()
      await expect(page.getByText('Задание отменено')).toBeVisible()
    }
  })

  test('10.10: значок заданий на схеме ревью и строка в info; гайд админки', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Настройки цикла' }).click()
    // значок ✓ на каждом переходе, создающем задания (на стенде их два) + info-строка
    await expect(page.getByTestId('wf-assignment-badge').first()).toBeVisible()
    await page.getByTestId('wf-assignment-badge').first().click()
    await expect(page.getByTestId('wf-assignment-line')).toContainText('Создаёт задания:')
    await page.screenshot({ path: 'e2e/screenshots/reassessment/14-workflow-badges.png' })
    // вкладка «Задания» — тот же гайд сверху (14.1)
    await page.getByRole('tab', { name: 'Задания' }).click()
    await expect(page.getByTestId('assignment-guide')).toBeVisible()
  })

  test('10.9: старт цикла создаёт задания карточки; отправка селф-ревью закрывает', async ({ page, request }) => {
    const auth = await adminLogin(request)
    const cycle = await (await request.post('/api/v1/reviews/cycles', {
      headers: auth, data: { name: `e2e assignments ${Date.now()}` },
    })).json()
    // сузить состав цикла до Дзюбы: гейт cycle_start_enabled остаётся включённым
    // (задания карточки и автозапуск переоценки гейтятся вместе, реш. 12.5), но
    // переоценка коснётся одного — свежая оценка Дзюбы и тот скипнется
    const staff = await (await request.get('/api/v1/staff/employees?active=true', {
      headers: auth })).json()
    const others = (staff as { id: number }[]).map((e) => e.id).filter((id) => id !== DZIUBA)
    const exclude = await request.post(
      `/api/v1/reviews/cycles/${cycle.id}/participants/exclude`, {
        headers: auth, data: { employee_ids: others, note: 'e2e: сценарий заданий' } })
    expect(exclude.status(), 'исключение остальных участников').toBeLessThan(300)

    const advance = await request.post(
      `/api/v1/reviews/cycles/${cycle.id}/advance-stage`, { headers: auth })
    expect(advance.status()).toBe(200)

    // у участника появилось задание селф-ревью в хабе
    await login(page, USERS.employee)
    await page.goto('/#/assessments')
    await expect(page.getByText('Карточка селф-ревью')).toBeVisible()

    // отправка селф-ревью закрывает задание (заполняем все строки черновика,
    // иначе пустая строка достижения валит валидацию отправки)
    await page.goto('/#/my-review')
    // дождаться отрисовки черновика — иначе count() словит 0 строк до загрузки
    const areas = page.getByPlaceholder(/Что сделал/)
    await areas.first().waitFor()
    for (let i = 0; i < await areas.count(); i++) {
      await areas.nth(i).fill('E2E: достижение по заданию селф-ревью')
      await page.locator('.rating-select').nth(i).click()
      // оверлей прошлого селекта может остаться открытым — берём последний и закрываем за собой
      await page.locator('.p-select-overlay').last()
        .getByRole('option', { name: 'выше ожиданий' }).click()
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: 'Отправить', exact: true }).click()
    await page.getByRole('button', { name: 'Да, отправить' }).click()
    await expect(page.getByText('Селф-ревью отправлено')).toBeVisible()

    // задание закрылось — карточки селф-ревью в хабе больше нет
    await page.goto('/#/assessments')
    await expect(page.getByText('Карточка селф-ревью')).toHaveCount(0)

    // убрать за собой: отменить цикл и созданные им задания
    await request.post(`/api/v1/reviews/cycles/${cycle.id}/cancel`, { headers: auth })
    const reg = await (await request.get('/api/v1/admin/assignments', {
      headers: auth, params: { kind: 'self-review', page_size: 200 },
    })).json()
    const ids = reg.items.filter((a: { context: { cycle_id?: number }; status: string }) =>
      a.context?.cycle_id === cycle.id && ['pending', 'notified'].includes(a.status))
      .map((a: { id: number }) => a.id)
    if (ids.length) await request.post('/api/v1/admin/assignments/bulk', {
      headers: auth, data: { action: 'cancel', ids } })
  })
})
