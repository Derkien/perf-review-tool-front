import { test, expect } from '@playwright/test'
import { login, USERS, apiAuth } from './helpers'

/**
 * Сценарий change competency-dictionaries (6.1) — workflow заказчика через nginx e2e-стенда (scripts/e2e.sh):
 * выгрузка словарей → импорт диффа (новая категория + пункт) → импорт схемы с ними
 * проходит → импорт схемы с опечаткой блокируется.
 * Перезапускаемость: справочники только растут — повторный прогон видит «без изменений»
 * и сверяет, что значения на месте; черновик схемы заменяется (номер переиспользуется),
 * в конце удаляем его через API (самоподчистка схемы; 2 e2e-значения справочника
 * остаются в БД навсегда — контур не предусматривает удаления).
 */
test.describe.serial('Справочники: workflow словари-до-схем', () => {
  test('выгрузка → дифф-импорт → схема проходит → опечатка блокируется', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Справочники' }).click()

    // 1. раздел справочников: селектор + значения грейдов (дефолтный справочник)
    await expect(page.getByTestId('dict-items-table').getByRole('row')
      .filter({ hasText: 'Стажёр' })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/01-section.png', fullPage: true })

    // 2. выгрузка словарей (клик → скачивание xlsx)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('dict-export-btn').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('dictionaries.xlsx')

    // 3. импорт диффа: новая категория + пункт этого справочника
    // (инпут скопирован на вкладку «Справочники»: все панели в DOM, .first() взял бы схемы)
    await page.getByRole('tabpanel', { name: 'Справочники' })
      .locator('input[type="file"]').setInputFiles('e2e/fixtures/dictionaries-e2e.xlsx')
    await page.getByTestId('dict-import-btn').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const rerun = await dialog.getByText('Без изменений').count() > 0
    if (!rerun) {
      await expect(dialog.getByTestId('dict-diff-added').first()).toContainText('E2E Инфраструктура')
      await expect(dialog.getByTestId('dict-diff-added').nth(1)).toContainText('E2E Docker')
      await page.screenshot({ path: 'e2e/screenshots/dictionaries/02-diff-preview.png' })
      await dialog.getByRole('button', { name: 'Применить дифф' }).click()
      await expect(page.getByText(/Словари обновлены/)).toBeVisible()
    } else {
      await page.screenshot({ path: 'e2e/screenshots/dictionaries/02-diff-no-changes.png' })
      await dialog.getByRole('button', { name: 'Отмена' }).click()
    }

    // 4. значения в справочнике: селектор → пункты, новая связка видна
    await page.getByTestId('dict-select').click()
    await page.getByRole('option', { name: 'Пункты компетенций' }).click()
    await expect(page.getByTestId('dict-items-table').getByRole('row')
      .filter({ hasText: 'E2E Docker' })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/03-item-in-dict.png' })

    // 5. импорт схемы с новыми значениями — проходит (workflow словари-до-схем)
    await page.getByRole('tab', { name: 'Матрицы компетенций' }).click()
    await page.getByRole('tabpanel', { name: 'Матрицы компетенций' })
      .locator('input[type="file"]').setInputFiles('e2e/fixtures/schema-dictionaries-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    const schemaDialog = page.getByRole('dialog')
    // в сид-мире пара (hard, backend) новая; после прошлых прогонов — «без изменений»
    await expect(schemaDialog).toContainText('backend')
    const unchanged = await schemaDialog.getByText('без изменений — версия не поднимется').count() > 0
    if (!unchanged) {
      await page.screenshot({ path: 'e2e/screenshots/dictionaries/04-schema-preview.png' })
      await schemaDialog.getByRole('button', { name: 'Применить (создать черновики)' }).click()
      await expect(page.getByText('созданы черновики')).toBeVisible()
    } else {
      await schemaDialog.getByRole('button', { name: 'Отмена' }).click()
    }

    // 6. опечатка пункта блокирует файл: предпросмотр не создаётся, ошибка называет справочник
    await page.getByRole('tabpanel', { name: 'Матрицы компетенций' })
      .locator('input[type="file"]').setInputFiles('e2e/fixtures/schema-dictionaries-typo-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    // сообщение об ошибке — в тосте (err-msg в AppLayout скрыт, не считать его)
    const typoToast = page.locator('.p-toast-detail').filter({ hasText: 'справочнике пунктов' })
    await expect(typoToast.first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/05-typo-blocked.png', fullPage: true })

    // самоподчистка: удалить e2e-черновик — только если в нём наш пункт (заказчик
    // может держать свой черновик hard/backend в живой БД — его не трогаем)
    const schemas = await (await page.request.get('/api/v1/competencies/schemas',
                                                   { headers: apiAuth() })).json()
    const group = (schemas.groups as { type_code: string; specialty: string; versions:
      { id: number; status: string }[] }[]).find((g) => g.type_code === 'hard'
        && g.specialty === 'backend')
    for (const v of group?.versions.filter((x) => x.status === 'draft') || []) {
      const items = await (await page.request.get(
        `/api/v1/competencies/matrices/${v.id}/items`, { headers: apiAuth() })).json()
      if ((items as { name: string }[]).some((it) => it.name === 'E2E Docker')) {
        const del = await page.request.delete(`/api/v1/competencies/schemas/${v.id}`,
                                              { headers: apiAuth() })
        expect(del.status(), 'удаление e2e-черновика').toBe(200)
      }
    }
  })
})
