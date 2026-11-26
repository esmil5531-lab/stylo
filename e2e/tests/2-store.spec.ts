import { expect, test } from '@playwright/test';

import { adminLogin, PHONES, placeOrderAsSara } from '../helpers';
import { saveState, tokens } from '../state';

/**
 * Journey 2 — the store («أزياء لورا»): its panel is open when a customer orders; the new order
 * shows up by itself (alert + tab title), the store confirms and prepares it, and cannot open
 * Stylo-only pages.
 */
test('the store sees a new order arrive, confirms it and prepares it', async ({ page }) => {
  await adminLogin(page, PHONES.lauraOwner);
  await expect(page.getByText('STYLO STORE')).toBeVisible();
  await expect(page.getByText('لوحة متجر «أزياء لورا»')).toBeVisible();

  // A customer orders while the panel is open → within one refresh (20 s) the alert appears.
  const order = await placeOrderAsSara(tokens().sara);
  saveState({ orderId: order.id, orderNumber: order.orderNumber, orderTotal: order.total });
  const alert = page.locator('.order-alert.tone-new');
  await expect(alert).toContainText(`وصل طلب جديد #${order.orderNumber}`, { timeout: 40_000 });
  await expect(page).toHaveTitle(/^\(\d+\) /);

  // Open it from the alert, confirm, then start preparing.
  await alert.getByRole('link', { name: 'عرض الطلبات' }).click();
  await expect(page).toHaveURL(/\/admin\/orders\?status=pending/);
  await page.getByText(`#${order.orderNumber}`, { exact: true }).first().click();
  await expect(page.getByText(`طلب #${order.orderNumber}`)).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.locator('.page-head, .card').getByText('مؤكد', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'بدء التجهيز' }).click();
  await expect(page.locator('.page-head, .card').getByText('قيد التجهيز', { exact: true }).first()).toBeVisible();
  // Handing it to a driver is Stylo's job, not the store's.
  await expect(page.getByRole('button', { name: /تسليم للسائق/ })).toHaveCount(0);

  // Stylo-only pages: a clear refusal, no data.
  await page.goto('/admin/staff');
  await expect(page.getByText('ليست لديك صلاحية لهذه الصفحة')).toBeVisible();
});
