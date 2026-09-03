/** HTTP error helpers — thrown from routes, rendered by the error middleware. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Please sign in.') => new HttpError(401, message);
export const forbidden = (message = 'Not allowed.') => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message, details) => new HttpError(409, message, details);
export const tooMany = (message = 'Too many attempts. Please wait a moment.') => new HttpError(429, message);

/** Turn a Zod error into a `{ field: message }` map the UI can render inline. */
export function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues || []) {
    const key = issue.path?.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
