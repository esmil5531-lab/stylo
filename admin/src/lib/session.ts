/**
 * The back-office session token (from phone + code sign-in). Kept in localStorage so a refresh
 * keeps you signed in; the server expires admin sessions after 12 hours and on «تسجيل الخروج».
 */
const KEY = 'stylo-admin-session';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode: the session lasts for this page only */
  }
  window.dispatchEvent(new Event('stylo-session'));
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('stylo-session'));
}
