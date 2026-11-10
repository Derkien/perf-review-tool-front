import { test, expect } from '@playwright/test'
import { login, USERS, employeeId } from './helpers'

/**
 * Сценарий 7.3 (change configurable-competency-matrix), сквозной через nginx :8080:
 * шаблон → импорт с предпросмотром → черновик → демо → активация → карточка сотрудника
 * (разметка по новой версии, история с версиями, сравнение только текущей версии).
 * Повторяемость: apply заменяет черновик той же пары, номер версии растёт —
 * ассерты по контенту и захваченному из предпросмотра номеру, не по константе.
 */
test.describe.serial('Матрицы компетенций: e2e', () => {
  let nextVersion = 0 // «будет создан черновик vN» из модалки предпросмотра

  test('админ: шаблон → импорт → черновик → демо-предпросмотр → активация', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    const tab = page.getByRole('tab', { name: 'Матрицы компетенций' })
    await tab.click()
    await expect(page.getByTestId('competency-schemas')).toBeVisible()

    // 1. скачивание шаблона
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Скачать шаблон' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('competency-schema-template.xlsx')

    // 2. импорт с предпросмотром
    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/schema-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Предпросмотр загрузки схемы')
    await expect(dialog).toContainText('android')
    const summary = await dialog
      .getByText(/будет создан черновик v(\d+)/)
      .textContent()
    nextVersion = Number(summary!.match(/v(\d+)/)![1])
    await page.screenshot({ path: 'e2e/screenshots/01-import-preview.png' })
    await dialog.getByRole('button', { name: 'Применить (создать черновики)' }).click()
    await expect(page.getByText('созданы черновики')).toBeVisible() // toast

    // 3. бейдж черновика у роли android
    const groupRow = page.getByRole('row').filter({ hasText: 'android' }).first()
    await expect(groupRow.getByTestId('draft-badge')).toBeVisible()

    // 4. демо-предпросмотр черновика (раскрытие группы → клик по черновику).
    // Скоуп на вложенную таблицу версий: бейдж «есть черновик» матчится и в строке группы.
    await groupRow.locator('.p-datatable-row-toggle-button').click()
    const draftRow = page.locator('.versions-table')
      .getByRole('row').filter({ hasText: 'черновик' }).first()
    await draftRow.click()
    await expect(page.getByText('демо-данные')).toBeVisible()
    await expect(page.getByText('Схема ещё не опубликована')).toBeVisible()
    await expect(page.getByText('E2E: пункт один').first()).toBeVisible()
    await expect(page.getByText(/самооценка \d+ · рукля \d+/).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/02-draft-demo.png', fullPage: true })

    // 5. активация через модалку подтверждения
    await draftRow.getByRole('button', { name: 'Активировать' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('уйдёт в архив')
    await expect(confirm).toContainText(`Активировать версию: v${nextVersion}`)
    await page.screenshot({ path: 'e2e/screenshots/03-activate-confirm.png' })
    await confirm.getByRole('button', { name: 'Активировать' }).click()
    await expect(page.getByText(`Версия v${nextVersion} активна`)).toBeVisible()
    await expect(groupRow.getByTestId('draft-badge')).toHaveCount(0)
  })

  test('карточка сотрудника: разметка по новой версии, история, сравнение', async ({ page }) => {
    test.skip(!nextVersion, 'первый тест не дошёл до активации')
    await login(page, USERS.admin)
    const id = await employeeId(page, USERS.employee.email)
    await page.goto(`/#/staff/${id}`)
    await page.getByRole('tab', { name: 'Компетенции' }).click()

    // радар и бейдж — по активной версии с новыми пунктами
    await expect(page.getByTestId('schema-version-badge')).toHaveText(`схема v${nextVersion}`)
    await page.screenshot({ path: 'e2e/screenshots/04-employee-new-version.png', fullPage: true })

    // разметка: форма по пунктам новой версии (порядок строк — по алфавиту, не по «Порядку»).
    // Дата — уникальная в прошлом: сессии группируются по (тип, дата, заполнявший),
    // повторная разметка сегодняшним числом сольётся со сессией прошлой версии.
    const iso = new Date(Date.now() - (Date.now() % 300 + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10)
    await page.getByRole('button', { name: 'Внести разметку' }).click()
    await page.locator('input[type="date"]').fill(iso)
    const markRows = page.locator('.mark-row')
    await expect(markRows).toHaveCount(3)
    await expect(markRows.filter({ hasText: 'E2E: пункт один' })).toHaveCount(1)
    await expect(markRows.filter({ hasText: 'E2E: пункт три' })).toHaveCount(1)
    // опции подписаны «грейд · вес»; инпута у Select нет (combobox-спан),
    // список своего оверлея берём через aria-controls
    const grades = ['Основной 1', 'Старший 1', 'Ключевой 1']
    for (let i = 0; i < 3; i++) {
      const sel = markRows.nth(i).locator('.mark-select')
      await sel.click()
      const listId = await sel.locator('[aria-controls]').getAttribute('aria-controls')
      await page.locator(`#${listId} [role="option"]`).filter({ hasText: grades[i] }).click()
      await page.keyboard.press('Escape')
      await expect(markRows.nth(i)).toContainText(grades[i])
    }
    await page.getByRole('button', { name: 'Сохранить разметку' }).click()
    await expect(page.getByText('Разметка сохранена (3 пунктов)')).toBeVisible()

    // история: у новой сессии бейдж версии без «архива», у старых (v1) — «архив»
    const history = page.locator('.p-datatable-table')
    const newSessionRow = history
      .getByRole('row').filter({ hasText: iso }).filter({ hasText: `v${nextVersion}` }).first()
    await expect(newSessionRow).toBeVisible()
    const archivedRow = history
      .getByRole('row').filter({ hasText: 'архив' }).filter({ hasText: 'руководитель' }).first()
    await expect(archivedRow).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/05-employee-history.png', fullPage: true })

    // сравнение: текущая версия добавляется на паутинку, архивная — нет
    await newSessionRow.click()
    await expect(newSessionRow.locator('i.pi-check-circle')).toBeVisible()
    await archivedRow.click()
    await expect(archivedRow.locator('i.pi-check-circle')).toHaveCount(0)
    await expect(archivedRow.locator('i.pi-circle')).toBeVisible()
  })
})
