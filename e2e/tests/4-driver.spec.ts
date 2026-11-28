import type { Page } from '@playwright/test';

import { codeOnScreen, expect, expectOrder, localPhone, PHONES, test, untilSaved } from '../helpers';
import { readState, tokens } from '../state';

/**
 * Journey 4 — the driver, on his phone: signs in, is told about the new assignment, picks the
 * parcel up at the store and delivers it, collecting the cash (both steps confirmed).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('the driver gets the new order, picks it up and delivers it with the cash', async ({ page }) => {
  const { orderId, orderNumber, orderTotal } = readState();
  test.skip(!orderId, 'needs the order assigned by the staff journey');
  const see = (text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();

  await expectOrder(tokens().admin, orderId!, { status: 'processing', driver: true }, 'the dispatch journey (3)');
  await page.goto('/login');
  await page.getByLabel('رقم الهاتف').filter({ visible: true }).fill(localPhone(PHONES.driver));
  await tap('إرسال رمز الدخول').click();
  await page.getByLabel('رمز الدخول').filter({ visible: true }).fill(await codeOnScreen(page));
  await page.getByRole('button', { name: 'دخول', exact: true }).filter({ visible: true }).click();

  // Drivers land on their panel; the new assignment is announced.
  await expect(page).toHaveURL(/\/driver/);
  await expect(see('لوحة المندوب')).toBeVisible();
  const label = `طلب ⁦#${orderNumber}⁩`;
  await expect(see(label)).toBeVisible();

  // The card of THIS order (the driver may have others).
  const card = (p: Page) =>
    p.locator('div').filter({ visible: true }).filter({ has: p.getByText(label, { exact: true }) }).filter({ has: p.getByRole('button') }).last();

  await card(page).getByRole('button', { name: 'استلمت الطلب من المتجر' }).click();
  await untilSaved(page, 'POST', /\/v1\/driver\/orders\/[^/]+\/picked-up$/, () => tap('نعم، استلمت').click());
  await expect(card(page).getByRole('button', { name: /^تم التسليم واستلام/ })).toBeVisible();

  const cash = (orderTotal! / 1000).toLocaleString('en-US');
  await card(page).getByRole('button', { name: /^تم التسليم واستلام/ }).click();
  await expect(see(new RegExp(`هل استلمت ${cash} د\\.ل نقداً`))).toBeVisible();
  await untilSaved(page, 'POST', /\/v1\/driver\/orders\/[^/]+\/delivered$/, () => tap('نعم، استلمت').click());

  // Delivered: it leaves the active list and the cash is now in his custody.
  await expect(see('سُلّمت اليوم')).toBeVisible();
  await expect(page.getByRole('button', { name: 'استلمت الطلب من المتجر' }).filter({ visible: true }).filter({ hasText: label })).toHaveCount(0);
  await expect(see('في عهدتك الآن')).toBeVisible();
  await expectOrder(tokens().admin, orderId!, { status: 'delivered' }, 'the delivery');
});
