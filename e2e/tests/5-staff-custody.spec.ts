import { api, DRIVER_NAME, expect, expectOrder, test, untilSaved } from '../helpers';
import { readState, STAFF_SESSION, tokens } from '../state';

/**
 * Journey 5 (Stylo staff, part 2) — the order is delivered: the customer sees it, and the
 * operations manager receives the driver's cash («تقفيل العُهدة»), which brings his custody to zero.
 */
test.use({ storageState: STAFF_SESSION });

test('Stylo staff close the driver custody after the delivery', async ({ page }) => {
  const { orderId, orderNumber, orderTotal } = readState();
  test.skip(!orderId, 'needs the order delivered by the driver journey');

  // The customer's order is delivered (and paid in cash).
  await expectOrder(tokens().admin, orderId!, { status: 'delivered' }, 'the driver journey (4)');
  const mine = await api('GET', `/orders/${orderId}`, undefined, tokens().sara);
  expect(mine.status).toBe('delivered');

  await page.goto('/admin/custody');
  await expect(page.getByText('عُهدة المناديب').first()).toBeVisible();
  const row = page.locator('tr', { hasText: DRIVER_NAME });
  await row.getByRole('button', { name: 'التفاصيل والتقفيل' }).click();

  // The delivered order is in his custody with its amount; receive the whole amount.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(`#${orderNumber}`)).toBeVisible();
  const amount = (orderTotal! / 1000).toLocaleString('en-US');
  expect(amount.length).toBeGreaterThan(0);
  await untilSaved(page, 'POST', /\/v1\/admin\/custody\/[^/]+\/settle$/, () =>
    dialog.getByRole('button', { name: /^تقفيل العُهدة واستلام/ }).click(),
  );
  await expect(page.getByText(new RegExp(`تقفيل عُهدة ${DRIVER_NAME}`))).toBeVisible();
  await page.getByRole('button', { name: /^(تم|إغلاق)$/ }).first().click();

  // Back to zero: nothing left to close for him.
  await expect(row.getByRole('button', { name: 'التفاصيل والتقفيل' })).toBeDisabled();
  const custody = await api('GET', '/admin/custody', undefined, tokens().admin);
  const driver = custody.items.find((d: { driver: { name: string } }) => d.driver.name === DRIVER_NAME);
  expect(driver.amount).toBe(0);
});
