import { test, expect } from '@playwright/test'
import { login, USERS, apiAuth } from './helpers'

/**
 * Сценарий change competency-dictionaries (6.1 + приёмка 12.11) — workflow заказчика
 * через nginx e2e-стенда (scripts/e2e.sh): выгрузка словарей → импорт диффа (новая
 * категория + пункт) → импорт схемы с ними проходит → импорт схемы с опечаткой
 * блокируется персистентной модалькой с файлом ошибок. Плюс новый UX справочников:
 * список → drill-down значений с поиском, слаги значений, выгрузка одного справочника.
 * Перезапускаемость: справочники только растут — повторный прогон видит «без изменений»
 * и сверяет, что значения на месте; черновик схемы заменяется, в конце удаляем его
 * через API (2 e2e-значения справочника остаются в БД навсегда — удаления нет).
 */
test.describe.serial('Справочники: workflow словари-до-схем', () => {
  test('список → дифф-импорт → схема проходит → опечатка блокируется модалкой', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Справочники' }).click()

    // 1. раздел = список справочников (слаг, название, счётчик, бейдж «в коде»)
    await expect(page.getByTestId('dict-list-table').getByRole('row')
      .filter({ hasText: 'Грейды' })).toBeVisible()
    await expect(page.getByTestId('dict-list-table')).toContainText('в коде')
    // поиск по справочникам: названию и слагу
    await page.getByTestId('dict-search-input').fill('competency-item')
    await expect(page.getByTestId('dict-list-table').getByRole('row')
      .filter({ hasText: 'Пункты компетенций' })).toBeVisible()
    await page.getByTestId('dict-search-input').fill('')
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/01-section.png', fullPage: true })

    // 2. выгрузка всех словарей (клик → скачивание xlsx)
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
    // rerun-детект по тексту итогового Message («Без изменений: …» с двоеточием) —
    // строчные подписи «без изменений» есть у каждого листа без правок в любом диффе
    const rerun = await dialog.getByText('Без изменений:').count() > 0
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

    // 4. drill-down значений справочника: новая связка видна, слаги заполнены
    await page.getByTestId('dict-open-competency-item').click()
    await expect(page.getByTestId('dict-items-table').getByRole('row')
      .filter({ hasText: 'E2E Docker' })).toBeVisible()
    // слаг значения сгенерирован автотранслитом (python-slugify)
    await expect(page.getByTestId('dict-items-table')).toContainText('e2e-docker')
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/03-item-in-dict.png', fullPage: true })
    // локальный поиск по значениям (значение/слаг/тайтл)
    await page.getByTestId('dict-search-input').fill('e2e-docker')
    await expect(page.getByTestId('dict-items-table').getByRole('row')
      .filter({ hasText: 'E2E Docker' })).toBeVisible()
    await page.getByTestId('dict-search-input').fill('')

    // 5. выгрузка одного справочника — источник диффа
    const oneDownload = page.waitForEvent('download')
    await page.getByTestId('dict-export-one-btn').click()
    expect((await oneDownload).suggestedFilename()).toBe('dictionary-competency-item.xlsx')
    await page.getByTestId('dict-back').click()
    await expect(page.getByTestId('dict-list-table')).toBeVisible()

    // 6. импорт схемы с новыми значениями — проходит (workflow словари-до-схем)
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

    // 7. опечатка пункта блокирует файл: персистентная модалка ошибок + файл ошибок
    await page.getByRole('tabpanel', { name: 'Матрицы компетенций' })
      .locator('input[type="file"]').setInputFiles('e2e/fixtures/schema-dictionaries-typo-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    const errorsDialog = page.getByTestId('import-errors-dialog')
    await expect(errorsDialog).toBeVisible()
    await expect(errorsDialog).toContainText('файл не принят целиком')
    await expect(errorsDialog.getByTestId('import-errors-table'))
      .toContainText('справочнике пунктов')
    await expect(errorsDialog.getByTestId('import-errors-download')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/dictionaries/05-typo-blocked.png', fullPage: true })
    await errorsDialog.getByTestId('import-errors-close').click()

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
