/**
 * Thin fetch wrapper around the API.
 *
 * Every call returns parsed JSON or throws an ApiError carrying the status and
 * any `fieldErrors` the server sent, so forms can show messages inline.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = details.fieldErrors || null;
    this.serverRev = details.serverRev ?? null;
    this.offline = status === 0 || details.offline === true;
  }
}

const safeJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'include',
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
    response = await fetch(BASE + path, { credentials: 'include' });
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
  deleteAccount: () => request('/auth/account', { method: 'DELETE', body: { confirmation: 'DELETE' } }),

  searchUsers: (query = '', signal) => request(`/users/search?q=${encodeURIComponent(query)}`, { signal }),
  getUser: (id) => request(`/users/${encodeURIComponent(id)}`),
  getFriends: () => request('/friends'),
  sendFriendRequest: (payload) => request('/friends/request', { method: 'POST', body: payload }),
  createContact: (payload) => request('/friends/contacts', { method: 'POST', body: payload }),
  acceptFriendRequest: (id) => request(`/friends/${encodeURIComponent(id)}/accept`, { method: 'POST', body: {} }),
  rejectFriendRequest: (id) => request(`/friends/${encodeURIComponent(id)}/reject`, { method: 'POST', body: {} }),
  removeFriend: (id) => request(`/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getFriendship: (id) => request(`/friendships/${encodeURIComponent(id)}`),
  getFriendshipLedger: (id) => request(`/friendships/${encodeURIComponent(id)}/expenses`),
  getFriendshipBalance: (id) => request(`/friendships/${encodeURIComponent(id)}/balance`),
  getFriendshipTotals: (id) => request(`/friendships/${encodeURIComponent(id)}/totals`),
  getGroups: () => request('/groups'),
  createGroup: (payload) => request('/groups', { method: 'POST', body: payload }),
  getGroup: (id) => request(`/groups/${encodeURIComponent(id)}`),
  updateGroup: (id, payload) => request(`/groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  deleteGroup: (id) => request(`/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addGroupMember: (id, payload) => request(`/groups/${encodeURIComponent(id)}/members`, { method: 'POST', body: typeof payload === 'string' ? { userId: payload } : payload }),
  removeGroupMember: (id, userId) => request(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getGroupLedger: (id) => request(`/groups/${encodeURIComponent(id)}/expenses`),
  getGroupBalances: (id) => request(`/groups/${encodeURIComponent(id)}/balances`),
  getGroupTotals: (id) => request(`/groups/${encodeURIComponent(id)}/totals`),
  getSettlementPlan: (id) => request(`/groups/${encodeURIComponent(id)}/settlement-plan`),
  createExpense: (payload) => request('/expenses', { method: 'POST', body: payload }),
  getSharedOverview: () => request('/shared/overview'),
  settleAll: (payload) => request('/settlements/settle-all', { method: 'POST', body: payload }),
  updateSettlement: (id, payload) => request(`/settlements/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  restoreExpense: (id, payload) => request(`/expenses/${encodeURIComponent(id)}/restore`, { method: 'POST', body: payload }),
  commentOnExpense: (id, payload) => request(`/expenses/${encodeURIComponent(id)}/comments`, { method: 'POST', body: payload }),
  generateOccurrences: (id) => request(`/expenses/${encodeURIComponent(id)}/occurrences`, { method: 'POST', body: {} }),
  downloadSharedCsv: (type, id) => download(`/shared/export?contextType=${encodeURIComponent(type)}&contextId=${encodeURIComponent(id)}`, 'shared-expenses.csv'),
  updateExpense: (id, payload) => request(`/expenses/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  deleteExpense: (id, payload) => request(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE', body: payload }),
  createSettlement: (payload) => request('/settlements', { method: 'POST', body: payload }),
  deleteSettlement: (id, payload) => request(`/settlements/${encodeURIComponent(id)}`, { method: 'DELETE', body: payload }),
  getSharedSummary: (monthId, signal) => request(`/shared/summary${monthId ? `?monthId=${encodeURIComponent(monthId)}` : ''}`, { signal }),

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
