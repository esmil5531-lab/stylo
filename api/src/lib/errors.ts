/** Errors the API returns on purpose. `message` is Arabic and safe to show to users. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} غير موجود`);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = () => new AppError(401, 'unauthorized', 'يجب تسجيل الدخول');
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const forbidden = (message = 'ليست لديك صلاحية لهذا الإجراء') => new AppError(403, 'forbidden', message);
