/**
 * Thin fetch wrapper around the API.
 *
 * Every call returns parsed JSON or throws an ApiError carrying the status and
 * any `fieldErrors` the server sent, so forms can show messages inline.
 */
const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = details.fieldErrors || null;
    this.serverRev = details.serverRev ?? null;
    this.offline = status === 0;
  }
}

const safeJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError('Cannot reach the server — is it still running?', 0);
  }

  const text = response.status === 204 ? '' : await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = data?.error || {};
    throw new ApiError(error.message || `Request failed (${response.status})`, response.status, error);
  }
  return data;
}

/** Download a file the server generated, keeping its Content-Disposition name. */
async function download(path, fallbackName) {
  let response;
  try {
    response = await fetch(BASE + path, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Cannot reach the server — is it still running?', 0);
  }
  if (!response.ok) {
    const data = safeJson(await response.text()) || {};
    throw new ApiError(data.error?.message || 'That export could not be created.', response.status, data.error || {});
  }

  const disposition = response.headers.get('content-disposition') || '';
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

export const api = {
  health: () => request('/health'),

  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/auth/logout', { method: 'POST', body: {} }),
  me: (signal) => request('/auth/me', { signal }),
  rename: (name) => request('/auth/profile', { method: 'PATCH', body: { name } }),

  getBudget: (signal) => request('/budget', { signal }),
  saveBudget: (store, rev) => request('/budget', { method: 'PUT', body: { store, rev } }),
  importBudget: (payload) => request('/budget/import', { method: 'POST', body: payload }),

  exportMonths: () => request('/export/months'),
  downloadXlsx: (months = 'all') => download(
    `/export/xlsx?months=${encodeURIComponent(Array.isArray(months) ? months.join(',') : months)}`,
    'expenses.xlsx',
  ),
  downloadJson: () => download('/export/json', 'expense-manager-backup.json'),
};
