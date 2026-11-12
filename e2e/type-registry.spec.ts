import { test, expect } from '@playwright/test'
import { login, USERS, employeeId } from './helpers'

/**
 * Сценарий change competency-type-registry (4.1), через nginx e2e-стенда (scripts/e2e.sh):
 * создание типа в админке → импорт схемы нового типа → вкладка у сотрудника;
 * реимпорт без изменений не поднимает версию; селектор версий переключает графики.
 * Перезапускаемость: активная product-схема живёт в БД — повторный прогон
 * видит «без изменений» и уходит в skip после проверки, что версия не выросла.
 */
test.describe.serial('Реестр типов: e2e', () => {
  test('админ: тип product → импорт схемы нового типа → активация', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Матрицы компетенций' }).click()

    // 1. секция типов реестра: product уже есть (повторный прогон) или создаётся.
    // ждём строку сида (hard) — реестр загружен, иначе гонка с пустой таблицей
    const typesTable = page.getByTestId('types-table')
    await expect(typesTable.getByRole('row').filter({ hasText: 'hard' })).toBeVisible()
    if (await typesTable.getByRole('row').filter({ hasText: 'product' }).count() === 0) {
      await page.getByTestId('type-create-btn').click()
      await page.getByTestId('type-code-input').fill('product')
      await page.getByTestId('type-title-input').fill('Продуктовые')
      await page.screenshot({ path: 'e2e/screenshots/type-registry/01-type-create.png' })
      await page.getByTestId('type-submit').click()
      await expect(typesTable.getByRole('row').filter({ hasText: 'product' })).toBeVisible()
    }
    await page.screenshot({ path: 'e2e/screenshots/type-registry/01-types-section.png', fullPage: true })

    // 2. импорт схемы product/android с дифф-предпросмотром
    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/schema-product-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('product')
    if (await dialog.getByText('без изменений — версия не поднимется').count() > 0) {
      // повторный прогон: реимпорт идентичного содержимого — версия не поднимается;
      // отмена БЕЗ apply: в группе остаётся единственная версия без черновика
      await page.screenshot({ path: 'e2e/screenshots/type-registry/02-unchanged.png' })
      await dialog.getByRole('button', { name: 'Отмена' }).click()
      const groupRow = page.getByRole('row').filter({ hasText: 'product' }).first()
      await groupRow.locator('.p-datatable-row-toggle-button').click()
      await expect(page.locator('.versions-table').locator('tbody').getByRole('row')).toHaveCount(1)
      test.skip(true, 'product-схема уже активна с прошлого прогона — версия не выросла')
    }
    await expect(dialog).toContainText('новая') // пара (product, android) без активной версии
    await page.screenshot({ path: 'e2e/screenshots/type-registry/02-import-preview.png' })
    await dialog.getByRole('button', { name: 'Применить (создать черновики)' }).click()
    await expect(page.getByText('созданы черновики')).toBeVisible()

    // 3. активация черновика через модалку подтверждения
    const groupRow = page.getByRole('row').filter({ hasText: 'product' }).first()
    await groupRow.locator('.p-datatable-row-toggle-button').click()
    const draftRow = page.locator('.versions-table')
      .getByRole('row').filter({ hasText: 'черновик' }).first()
    await draftRow.getByRole('button', { name: 'Активировать' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('уйдёт в архив')
    await confirm.getByRole('button', { name: 'Активировать' }).click()
    await expect(page.getByText(/Версия v\d+ активна/)).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/type-registry/03-product-active.png', fullPage: true })

    // 4. самодостаточность: manager-разметка product-схемы у Дзюбы (45 дней назад —
    // вне окна чистки сессий assignments-e2e) — даёт истории v1 строку «руководитель»
    // для селектора версий второго теста
    const fm = await page.request.post('/api/v1/auth/dev-token', {
      data: { email: 'savanok_s_s@itgri.ru', role: 'functional-manager' } })
    const fmToken = ((await fm.json()) as { access_token: string }).access_token
    const fmHeaders = { Authorization: `Bearer ${fmToken}` }
    const dzuba = await employeeId(page, USERS.employee.email)
    const rows = await (await page.request.get(
      `/api/v1/competencies/employees/${dzuba}/matrix`,
      { headers: fmHeaders, params: { type_code: 'product' } })).json()
    const day = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)
    for (const row of rows as { item_id: number }[]) {
      const mark = await page.request.post('/api/v1/competencies/marks', {
        headers: fmHeaders,
        data: { employee_id: dzuba, item_id: row.item_id, level: 'Основной 1',
                assessed_on: day, assessor_kind: 'manager' } })
      expect(mark.status(), `product-разметка ${day}`).toBeLessThan(300)
    }
  })

  test('сотрудник: вкладка нового типа; селектор версий переключает графики', async ({ page }) => {
    await login(page, USERS.admin)
    const id = await employeeId(page, USERS.employee.email)
    await page.goto(`/#/staff/${id}`)
    await page.getByRole('tab', { name: 'Компетенции' }).click()

    // вкладки строятся по реестру: новый тип виден с названием из реестра
    const tabs = page.getByTestId('type-tabs')
    await expect(tabs.getByRole('button', { name: 'Продуктовые' })).toBeVisible()
    await tabs.getByRole('button', { name: 'Продуктовые' }).click()
    await expect(page.getByTestId('schema-version-badge')).toHaveText('схема v1')
    await page.screenshot({ path: 'e2e/screenshots/type-registry/04-employee-product-tab.png', fullPage: true })

    // селектор версий: на hard у Дзюбы несколько версий (боевая v1 + песочницы e2e)
    await tabs.getByRole('button', { name: 'Харды' }).click()
    const versionSelect = page.getByTestId('version-select')
    await expect(versionSelect).toBeVisible()
    // дефолт — последняя актуальная; история показывает только текущую версию
    await expect(versionSelect).toContainText('Текущая')
    // выбор архивной версии v1 (боевой состав 25 пунктов): бейдж, история и график — по ней
    await versionSelect.click()
    await page.getByRole('option', { name: /v1 — архивная/ }).click()
    await expect(page.getByTestId('schema-version-badge')).toHaveText('схема v1')
    const history = page.locator('.history-table')
    await expect(history.getByRole('row').filter({ hasText: 'v1' }).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/type-registry/05-version-selector.png', fullPage: true })
    // сравнение внутри выбранной версии: клик по строке добавляет сессию на паутинку
    const row = history.getByRole('row').filter({ hasText: 'руководитель' }).first()
    await row.click()
    await expect(row.locator('i.pi-check-circle')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/type-registry/06-archive-compare.png', fullPage: true })
  })
})
