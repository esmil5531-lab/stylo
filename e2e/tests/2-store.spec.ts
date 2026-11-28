import { adminLogin, expect, expectOrder, PHONES, placeOrderAsSara, test, untilSaved } from '../helpers';
import { saveState, STORE_SESSION, tokens } from '../state';

/**
 * Journey 2 — the store («أزياء لورا»): its panel is open when a customer orders; the new order
 * shows up by itself (alert + tab title), the store confirms and prepares it, and cannot open
 * Stylo-only pages.
 */
test('the store sees a new order arrive, confirms it and prepares it', async ({ page }) => {
  await adminLogin(page, PHONES.lauraOwner);
  await expect(page.getByText('STYLO STORE')).toBeVisible();
  await expect(page.getByText('لوحة متجر «أزياء لورا»')).toBeVisible();
  await page.context().storageState({ path: STORE_SESSION }); // reused by journey 6 (bank account)

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
  // Each step is checked on the status badge of the page head (the timeline always lists every
  // status name) and only once the server saved it.
  const status = page.locator('.page-head .badge');
  const saveStatus = /\/v1\/admin\/orders\/[^/]+\/status$/;
  await untilSaved(page, 'POST', saveStatus, () => page.getByRole('button', { name: 'تأكيد الطلب' }).click());
  await expect(status).toHaveText('مؤكد');
  await untilSaved(page, 'POST', saveStatus, () => page.getByRole('button', { name: 'بدء التجهيز' }).click());
  await expect(status).toHaveText('قيد التجهيز');
  await expectOrder(tokens().admin, order.id, { status: 'processing' }, 'the store journey');
  // Handing it to a driver is Stylo's job, not the store's.
  await expect(page.getByRole('button', { name: /تسليم للسائق/ })).toHaveCount(0);

  // Stylo-only pages: a clear refusal, no data.
  await page.goto('/admin/staff');
  await expect(page.getByText('ليست لديك صلاحية لهذه الصفحة')).toBeVisible();
});
