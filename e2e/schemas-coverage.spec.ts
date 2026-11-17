import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * Панель «Покрытие схем» (change competency-schemas-coverage) через nginx
 * e2e-стенда: прямой URL + рефреш сохраняют раздел; таблица статусов; фильтр
 * «нет схемы»; масс-выгрузка файла разметки; исключение/возврат пары с
 * подтверждением. Дозаполненный скелет и roundtrip выгрузки покрыты pytest
 * (test_schemas_coverage.py).
 */
test.describe.serial('Покрытие схем', () => {
  test('панель: URL/рефреш → фильтр → выгрузка → исключение → возврат', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin/schemas-coverage')
    await expect(page.getByTestId('coverage-table')).toBeVisible()
    await page.reload() // URL-роут сохраняет раздел
    await expect(page.getByTestId('coverage-table')).toBeVisible()

    // таблица статусов: в демо-мире есть активные пары (android/qa/soft)
    await expect(page.getByTestId('coverage-status-hard-android')).toHaveText('активна')
    await page.screenshot({ path: 'e2e/screenshots/coverage/01-table.png', fullPage: true })

    // фильтр «нет схемы» сужает таблицу
    await page.getByTestId('coverage-status-filter').click()
    await page.getByRole('option', { name: 'нет схемы' }).click()
    const rows = page.getByTestId('coverage-table').locator('tbody tr')
    const missingCount = await rows.count()
    expect(missingCount).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/screenshots/coverage/02-filter-missing.png', fullPage: true })

    // масс-выгрузка: выбрать все «нет схемы» → файл разметки
    await rows.first().locator('.p-checkbox-input').check()
    await expect(page.getByTestId('coverage-mass-bar')).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('coverage-export-btn').click()
    expect((await downloadPromise).suggestedFilename()).toBe('schemas-coverage.xlsx')

    // исключение выбранной пары с подтверждением → статус excluded → возврат
    await page.getByTestId('coverage-exclude-btn').click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('Исключить из квалификации')
    await expect(confirm).toContainText('перестанут требоваться')
    await page.screenshot({ path: 'e2e/screenshots/coverage/03-exclude-confirm.png' })
    await confirm.getByRole('button', { name: 'Исключить' }).click()
    await expect(page.getByText('Исключено из квалификации')).toBeVisible()

    await page.getByTestId('coverage-status-filter').click()
    await page.getByRole('option', { name: 'исключена' }).click()
    const excludedRow = page.getByTestId('coverage-table').locator('tbody tr').first()
    await expect(excludedRow).toContainText('исключена')
    await page.screenshot({ path: 'e2e/screenshots/coverage/04-excluded.png', fullPage: true })
    await excludedRow.locator('.p-checkbox-input').check()
    await page.getByTestId('coverage-include-btn').click()
    await confirm.getByRole('button', { name: 'Вернуть' }).click()
    await expect(page.getByText('Возвращено в квалификацию')).toBeVisible()
  })
})
