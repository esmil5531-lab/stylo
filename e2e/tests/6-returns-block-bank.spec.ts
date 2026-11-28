import { api, expect, expectOrder, slowDown, test, untilSaved } from '../helpers';
import { readState, STAFF_SESSION, STORE_SESSION, tokens } from '../state';

/**
 * Journey 6 — after the delivery (step 5): Stylo staff record a returned piece (restock +
 * deduction from the store's next payout), look at the customer's record and block / unblock
 * her; the store enters its bank account and the general manager verifies it.
 */
const IBAN = 'LY83002048000020100120361';

test.describe('returns, customer block, store bank account', () => {
  test('Stylo staff record a returned piece; the store payout will deduct it', async ({ browser }) => {
    const { orderId, orderNumber } = readState();
    test.skip(!orderId, 'needs the order delivered by the driver journey');
    await expectOrder(tokens().admin, orderId!, { status: 'delivered' }, 'the driver journey (4)');
    const context = await browser.newContext({ storageState: STAFF_SESSION });
    await slowDown(context);
    const page = await context.newPage();

    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText(`طلب #${orderNumber}`)).toBeVisible();
    const returns = page.locator('section', { has: page.getByText('المرتجعات', { exact: true }) });
    await returns.getByRole('button', { name: 'تسجيل إرجاع' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('select').first().selectOption('1');
    await dialog.getByRole('button', { name: 'المقاس غير مناسب' }).click();
    await expect(dialog.getByRole('checkbox')).toBeChecked(); // back on the shelf by default
    await untilSaved(page, 'POST', /\/v1\/admin\/orders\/[^/]+\/returns$/, () =>
      dialog.getByRole('button', { name: /^تسجيل الإرجاع واسترداد/ }).click(),
    );
    await expect(dialog).toHaveCount(0);
    await expect(returns.getByText(/مرتجع #\d+ · المقاس غير مناسب/)).toBeVisible();
    await expect(returns.getByText('يُخصم في التسوية القادمة')).toBeVisible();
    await expect(returns.getByText('عاد للمخزون')).toBeVisible();

    // The customer sees the refund on her order.
    const hers = await api('GET', `/orders/${orderId}`, undefined, tokens().sara);
    expect(hers.returns.length).toBeGreaterThan(0);
    await context.close();
  });

  test('Stylo staff see the customer record, block her (no checkout) and unblock her', async ({ browser }) => {
    const { orderId } = readState();
    test.skip(!orderId, 'needs the delivered order');
    const context = await browser.newContext({ storageState: STAFF_SESSION });
    await slowDown(context);
    const page = await context.newPage();
    await page.goto(`/admin/orders/${orderId}`);

    const card = page.locator('section', { has: page.getByText('سجل الزبون', { exact: true }) });
    await expect(card.getByText('طلبات سُلّمت')).toBeVisible();
    await card.getByRole('button', { name: 'حظر الزبون' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('اختبار آلي — يُلغى فوراً');
    await untilSaved(page, 'POST', /\/v1\/admin\/customers\/[^/]+\/block$/, () =>
      page.getByRole('dialog').getByRole('button', { name: 'تأكيد الحظر' }).click(),
    );
    await expect(card.getByText(/محظور منذ/)).toBeVisible();

    // Blocked: checkout refused with a clear message (browsing still open).
    const res = await fetch(`${process.env.E2E_BASE_URL ?? 'http://localhost:4000'}/v1/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens().sara}` },
      body: JSON.stringify({ deliveryMode: 'standard' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('customer_blocked');

    await untilSaved(page, 'POST', /\/v1\/admin\/customers\/[^/]+\/block$/, () =>
      card.getByRole('button', { name: 'إلغاء الحظر' }).click(),
    );
    await expect(card.getByRole('button', { name: 'حظر الزبون' })).toBeVisible();
    await context.close();
  });

  test('the store enters its bank account; the general manager verifies it', async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORE_SESSION });
    await slowDown(context);
    const page = await context.newPage();
    await page.goto('/admin/my-store');
    const bank = page.locator('section', { has: page.getByText('الحساب البنكي لتحويل المستحقات') });
    await expect(bank).toBeVisible();

    // A mistyped IBAN is refused by the server's check (mod 97).
    await bank.getByLabel('المصرف').fill('مصرف الجمهورية');
    await bank.getByLabel('اسم صاحب الحساب').fill('أزياء لورا');
    await bank.getByLabel('رقم الآيبان (IBAN)').fill(IBAN.slice(0, -1) + '2');
    await bank.getByRole('button', { name: 'حفظ الحساب البنكي' }).click();
    await expect(bank.getByText(/رقم الآيبان غير صحيح/)).toBeVisible();

    await bank.getByLabel('رقم الآيبان (IBAN)').fill('LY83 0020 4800 0020 1001 2036 1');
    await untilSaved(page, 'PUT', /\/v1\/admin\/my-store\/bank$/, () =>
      bank.getByRole('button', { name: 'حفظ الحساب البنكي' }).click(),
    );
    await expect(bank.getByText('بانتظار توثيق ستايلو').first()).toBeVisible();

    // The general manager verifies it (stores.bank); the store sees «موثّق».
    const me = await api('GET', '/admin/me', undefined, tokens().admin);
    expect(me.permissions).toContain('stores.bank');
    const stores = await api('GET', '/admin/stores?q=لورا', undefined, tokens().admin);
    const laura = stores.items.find((s: { slug: string }) => s.slug === 'laura');
    const verified = await api('POST', `/admin/stores/${laura.id}/bank/verify`, undefined, tokens().admin);
    expect(verified.verified).toBe(true);
    await page.reload();
    await expect(bank.getByText('موثّق من ستايلو')).toBeVisible();

    // Its next payout deducts the return recorded above.
    const today = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const preview = await api('GET', `/admin/payouts/preview?storeId=${laura.id}&from=2026-01-01&to=${today}`, undefined, tokens().admin);
    expect(preview.returnsCount).toBeGreaterThan(0);
    expect(preview.payout).toBe(preview.sales - preview.commission - preview.returnsAmount + preview.returnsCommission);
    await context.close();
  });
});
