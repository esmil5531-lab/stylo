import { expect, test } from '@playwright/test';

import { adminLogin, DRIVER_NAME, PHONES } from '../helpers';
import { readState, STAFF_SESSION } from '../state';

/**
 * Journey 3 (Stylo staff, part 1) — the operations manager sees «طلبات مؤكدة بلا سائق» and
 * assigns the order the store is preparing to a driver of the same city.
 */
test('Stylo staff see the order without a driver and assign an available one', async ({ page }) => {
  const { orderId, orderNumber } = readState();
  test.skip(!orderId, 'needs the order prepared by the store journey');

  await adminLogin(page, PHONES.operations);
  await expect(page.getByText('STYLO ADMIN')).toBeVisible();
  await page.context().storageState({ path: STAFF_SESSION }); // reused by the custody journey

  // Dispatch alert, then the order.
  await expect(page.locator('.order-alert.tone-info')).toContainText('طلبات مؤكدة بلا سائق', { timeout: 30_000 });
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(`طلب #${orderNumber}`)).toBeVisible();
  await expect(page.getByText('قيد التجهيز', { exact: true }).first()).toBeVisible();

  await expect(page.getByText('إسناد لسائق متاح')).toBeVisible();
  const select = page.locator('select', { has: page.locator('option', { hasText: DRIVER_NAME }) });
  const option = select.locator('option', { hasText: DRIVER_NAME });
  await select.selectOption({ value: (await option.getAttribute('value'))! });
  await page.getByRole('button', { name: 'إسناد الطلب' }).click();
  await expect(page.getByText(DRIVER_NAME).first()).toBeVisible();
  await expect(page.getByText('تغيير السائق')).toBeVisible();
});
