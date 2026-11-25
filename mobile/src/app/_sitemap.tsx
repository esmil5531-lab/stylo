/**
 * Expo Router ships a built-in `/_sitemap` screen that lists every route file. Customers must never
 * see it, so it renders the branded «الصفحة غير موجودة» page (the server already answers 404 there).
 */
export { default } from './+not-found';
