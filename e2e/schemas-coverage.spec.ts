import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * Панель «Покрытие схем» (change competency-schemas-coverage) через nginx
 * e2e-стенда: прямой URL + рефреш; единый фреймворк таблиц (пагинатор, фильтры
 * со сбросом, масс-действия плавающей панелью MassActionBar); масс-выгрузка
 * файла разметки по РАЗНОТИПНОЙ выборке (hard + soft — регресс жалобы 17.11);
 * исключение/возврат пары. Roundtrip дозаполненного скелета — в pytest.
 */
test.describe.serial('Покрытие схем', () => {
  test('панель: URL/рефреш → фильтры/пагинация → разнотипная выгрузка → исключение → возврат', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin/schemas-coverage')
    await expect(page.getByTestId('coverage-table')).toBeVisible()
    await page.reload() // URL-роут сохраняет раздел
    await expect(page.getByTestId('coverage-table')).toBeVisible()

    // единый фреймворк таблиц: пагинатор из коробки, фильтры очищаются и сбрасываются
    await expect(page.locator('[data-testid="coverage-table"] .p-paginator')).toBeVisible()
    await expect(page.getByTestId('coverage-status-hard-android')).toHaveText('активна')
    await page.getByTestId('coverage-status-filter').click()
    await page.getByRole('option', { name: 'нет схемы' }).click()
    const missingRows = page.getByTestId('coverage-table').locator('tbody tr')
    expect(await missingRows.count()).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/screenshots/coverage/02-filter-missing.png', fullPage: true })
    await expect(page.getByTestId('coverage-reset-filters')).toBeVisible()
    await page.getByTestId('coverage-reset-filters').click()
    await expect(page.getByTestId('coverage-status-hard-android')).toBeVisible() // сброс вернул все

    // РАЗНОТИПНАЯ выборка (регресс жалобы: hard + soft одновременно) → масс-выгрузка
    const rows = page.getByTestId('coverage-table').locator('tbody tr')
    const hardRow = rows.filter({ hasText: /^hard/ }).first()
    const softRow = rows.filter({ hasText: /^soft/ }).first()
    await hardRow.locator('.p-checkbox-input').check()
    await softRow.locator('.p-checkbox-input').check()
    const massBar = page.locator('.mass-bar') // единая плавающая панель внизу
    await expect(massBar).toBeVisible()
    await expect(massBar).toContainText('выбрано: 2')
    await page.screenshot({ path: 'e2e/screenshots/coverage/01b-mass-bar.png', fullPage: true })
    const downloadPromise = page.waitForEvent('download')
    await massBar.getByTestId('coverage-export-btn').click()
    expect((await downloadPromise).suggestedFilename()).toBe('schemas-coverage.xlsx')

    // исключение выбранной пары с подтверждением → статус excluded → возврат
    await massBar.getByTestId('coverage-exclude-btn').click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('Исключить из квалификации')
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
