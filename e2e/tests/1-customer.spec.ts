import { codeOnScreen, expect, localPhone, newCustomerPhone, simpleLauraProduct, test, untilSaved } from '../helpers';

/**
 * Journey 1 — a NEW customer on her phone: browses as a guest, adds a piece to the cart, signs in
 * with WhatsApp code only at «إتمام الطلب», gives her name, adds a Tripoli address and orders.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a new customer browses as a guest, signs in at checkout, adds her address and orders', async ({ page }) => {
  // Expo Router keeps earlier screens mounted (hidden): only look at what is on screen.
  const see = (text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();
  const product = await simpleLauraProduct();
  const phone = newCustomerPhone();

  // Home and the product page, as a guest.
  await page.goto('/');
  await expect(see('لأجلك')).toBeVisible();
  await page.goto(`/product/${product.id}`);
  await expect(see(product.name)).toBeVisible();
  await expect(see(/يصلك/)).toBeVisible(); // Tripoli by default: a delivery estimate
  // Wait for the server to save it: opening /cart right away would cancel the request.
  await untilSaved(page, 'POST', /\/v1\/cart\/items$/, () => tap('أضيفي إلى السلة').click());

  // The cart (guest): checkout asks for the phone number first.
  await page.goto('/cart');
  await expect(see('طلبك من «أزياء لورا»')).toBeVisible();
  await tap(/^إتمام الطلب ·/).click();

  // Sign-in with the code, then her name (new number).
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('رقم الهاتف').filter({ visible: true }).fill(localPhone(phone));
  await tap('إرسال رمز الدخول').click();
  await page.getByLabel('رمز الدخول').filter({ visible: true }).fill(await codeOnScreen(page));
  await page.getByRole('button', { name: 'دخول', exact: true }).filter({ visible: true }).click();
  await page.getByLabel('الاسم الكامل').filter({ visible: true }).fill('نجلاء اختبار');
  await tap('إنشاء الحساب والدخول').click();

  // Back in the cart, with the guest's piece kept: add a delivery address.
  await expect(page).toHaveURL(/\/cart/);
  await expect(see('طلبك من «أزياء لورا»')).toBeVisible();
  await see('أضيفي عنوان التوصيل').click();
  await expect(page).toHaveURL(/\/addresses\/new/);
  await page.getByText('طرابلس', { exact: true }).filter({ visible: true }).first().click();
  await page.getByLabel('الشارع').filter({ visible: true }).fill('شارع عمر المختار');
  await page.getByLabel('أقرب معلم').filter({ visible: true }).fill('قرب جامع ميزران');
  const recipient = page.getByLabel('اسم المستلم').filter({ visible: true });
  if (!(await recipient.inputValue())) await recipient.fill('نجلاء اختبار');
  const recipientPhone = page.getByLabel('هاتف المستلم').filter({ visible: true });
  if (!(await recipientPhone.inputValue())) await recipientPhone.fill(localPhone(phone));
  await untilSaved(page, 'POST', /\/v1\/me\/addresses$/, () => tap('حفظ العنوان').click());

  // Order: delivery options are priced, the order is placed.
  await expect(page).toHaveURL(/\/cart/);
  await expect(see('توصيل عادي')).toBeVisible();
  await see('توصيل عادي').click();
  await untilSaved(page, 'POST', /\/v1\/checkout$/, () => tap(/^إتمام الطلب ·/).click());
  await expect(see('تم استلام طلبك 🎉')).toBeVisible();
  const placed = await see(/#\d{6}\u2069? من «أزياء لورا»/).textContent();
  const orderNumber = Number(/#(\d{6})/.exec(placed ?? '')?.[1]);
  expect(orderNumber).toBeGreaterThan(100000);

  // «طلباتي» lists it as «قيد الانتظار».
  await page.goto('/orders');
  const card = see(new RegExp(`#${orderNumber}`));
  await expect(card).toBeVisible();
  await expect(see('قيد الانتظار')).toBeVisible();
});
