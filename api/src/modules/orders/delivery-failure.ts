/**
 * «تعذّر التسليم» — why a parcel on the road could not be delivered (owner-approved list).
 * The order becomes cancelled (shipped → cancelled, migration 0012), the items go back to stock and
 * the reason is recorded in the order history, so Stylo staff and the store see it.
 */
export const DELIVERY_FAILURES = {
  no_answer: 'الزبون لا يرد',
  refused: 'رفض الاستلام',
  wrong_address: 'عنوان غير صحيح',
  postponed: 'تأجيل من الزبون',
} as const;

export type DeliveryFailure = keyof typeof DELIVERY_FAILURES;
export const DELIVERY_FAILURE_KEYS = Object.keys(DELIVERY_FAILURES) as [DeliveryFailure, ...DeliveryFailure[]];

/** History note / cancel reason: «تعذّر التسليم: الزبون لا يرد — اتصلت 3 مرات». */
export function failureNote(reason: DeliveryFailure, note?: string | null): string {
  const extra = note?.trim();
  return `تعذّر التسليم: ${DELIVERY_FAILURES[reason]}${extra ? ` — ${extra}` : ''}`;
}
