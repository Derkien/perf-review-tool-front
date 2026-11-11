import { test, expect } from '@playwright/test'
import { login, USERS, employeeId } from './helpers'

/**
 * Нормы грейда (change competency-grade-norms), сквозной через nginx :8080:
 * импорт схемы с листом «Нормы» → активация → карточка сотрудника: радар
 * по категориям → детализация категории (чипы) → следующая степень (norm_grade).
 * Повторяемость: apply заменяет черновик той же пары, номер версии растёт —
 * ассерты по захваченному из предпросмотра номеру.
 */
test.describe.serial('Нормы грейда: e2e', () => {
  let nextVersion = 0 // «будет создан черновик vN» из модалки предпросмотра

  test('админ: импорт схемы с нормами → черновик → активация', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/#/admin')
    await page.getByRole('tab', { name: 'Матрицы компетенций' }).click()
    await expect(page.getByTestId('competency-schemas')).toBeVisible()

    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/schema-norms-e2e.xlsx')
    await page.getByRole('button', { name: 'Загрузить схему' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Предпросмотр загрузки схемы')
    await expect(dialog).toContainText('android')
    const summary = await dialog.getByText(/будет создан черновик v(\d+)/).textContent()
    nextVersion = Number(summary!.match(/v(\d+)/)![1])
    await page.screenshot({ path: 'e2e/screenshots/norms/01-import-preview.png' })
    await dialog.getByRole('button', { name: 'Применить (создать черновики)' }).click()
    await expect(page.getByText('созданы черновики')).toBeVisible()

    const groupRow = page.getByRole('row').filter({ hasText: 'android' }).first()
    await groupRow.locator('.p-datatable-row-toggle-button').click()
    const draftRow = page.locator('.versions-table')
      .getByRole('row').filter({ hasText: 'черновик' }).first()
    await draftRow.getByRole('button', { name: 'Активировать' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText(`Активировать версию: v${nextVersion}`)
    await page.screenshot({ path: 'e2e/screenshots/norms/02-activate-confirm.png' })
    await confirm.getByRole('button', { name: 'Активировать' }).click()
    await expect(page.getByText(`Версия v${nextVersion} активна`)).toBeVisible()
  })

  test('сотрудник: радар по категориям → детализация → следующая степень', async ({ page }) => {
    test.skip(!nextVersion, 'первый тест не дошёл до активации')
    await login(page, USERS.admin)
    const id = await employeeId(page, USERS.employee.email)
    await page.goto(`/#/staff/${id}`)
    await page.getByRole('tab', { name: 'Компетенции' }).click()

    // радар по категориям: оси и полигон нормы видны и без разметок
    await expect(page.getByTestId('schema-version-badge')).toHaveText(`схема v${nextVersion}`)
    await expect(page.locator('.comp-radar canvas').first()).toBeVisible()
    // чипы — только у категории из 2 пунктов; одиночный пункт — сам ось, без чипа
    const chips = page.locator('.cat-chip')
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toContainText('E2E Категория А')
    await page.screenshot({ path: 'e2e/screenshots/norms/03-radar-categories.png', fullPage: true })

    // клик по зоне подписи оси на самом радаре (верхняя ось = «E2E Категория А»):
    // подписи осей silent — фронт выбирает ось геометрически, углом клика от центра
    const box = (await page.locator('.comp-radar canvas').first().boundingBox())!
    const rMax = Math.min(box.width, box.height) * 0.66 / 2
    const axisClick = () => page.mouse.click(
      box.x + box.width / 2, box.y + box.height / 2 - rMax * 1.05)
    await axisClick()
    const detail = page.getByTestId('cat-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('E2E Категория А')
    // радар не прыгает: bbox холста не изменился после открытия детализации
    const boxAfter = (await page.locator('.comp-radar canvas').first().boundingBox())!
    expect(Math.abs(boxAfter.x - box.x)).toBeLessThan(1)
    expect(Math.abs(boxAfter.y - box.y)).toBeLessThan(1)
    expect(Math.abs(boxAfter.width - box.width)).toBeLessThan(1)
    expect(Math.abs(boxAfter.height - box.height)).toBeLessThan(1)
    await page.screenshot({ path: 'e2e/screenshots/norms/04-axis-click.png', fullPage: true })
    await axisClick()  // повторный клик по той же оси — закрывает
    await expect(detail).toBeHidden()

    // детализация категории: второй радар по пунктам с теми же сериями и нормами
    await chips.first().click()
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('E2E Категория А')
    await expect(detail.locator('canvas').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/norms/04-category-detail.png', fullPage: true })

    // следующая степень: переключатель шлёт radar с norm_grade грейда N+1
    const toggle = page.getByTestId('norm-grade-toggle')
    await expect(toggle).toBeVisible()
    const [normReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/radar') && r.url().includes('norm_grade=')),
      page.waitForResponse((r) => r.url().includes('/radar') && r.url().includes('norm_grade=')
        && r.status() === 200),
      toggle.getByRole('button').nth(1).click(),
    ])
    expect(normReq.url()).toMatch(/norm_grade=[^&]+/)
    await expect(page.locator('.radar-toolbar').first())
      .toContainText('норма «', { useInnerText: false })
    await page.screenshot({ path: 'e2e/screenshots/norms/05-next-grade.png', fullPage: true })
  })
})
