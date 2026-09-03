/**
 * Pure date helpers for the budget engine.
 *
 * Two string formats are used throughout the app and the stored schema (SRS §6):
 *   month key -> "YYYY-MM"     e.g. "2026-09"
 *   day key    -> "YYYY-MM-DD" e.g. "2026-09-04"
 *
 * All month arithmetic is done on the integer (year * 12 + month) axis so it is
 * immune to timezones and DST. Only `todayKey()` touches the local clock.
 */

const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function isMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_RE.test(value);
}

export function isDayKey(value) {
  return typeof value === 'string' && DAY_KEY_RE.test(value);
}

/** "2026-09" -> { year: 2026, month: 9 } (month is 1-12). */
export function parseMonthKey(key) {
  const match = MONTH_KEY_RE.exec(String(key));
  if (!match) throw new TypeError(`Invalid month key: ${JSON.stringify(key)}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Build a month key from a year and a 1-12 month, normalising overflow. */
export function toMonthKey(year, month) {
  const absolute = year * 12 + (month - 1);
  const y = Math.floor(absolute / 12);
  const m = (absolute % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

/** Signed month distance: monthsBetween("2026-09", "2026-12") === 3. */
export function monthsBetween(fromKey, toKey) {
  const from = parseMonthKey(fromKey);
  const to = parseMonthKey(toKey);
  return (to.year * 12 + to.month) - (from.year * 12 + from.month);
}

export function addMonths(key, count) {
  const { year, month } = parseMonthKey(key);
  return toMonthKey(year, month + count);
}

/** Number of days in the given month key (leap-year aware). */
export function daysInMonth(key) {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Resolve a bill's due day inside a month, clamped to the month's length so a
 * `dueDay: 31` definition still lands on 28/29/30 in shorter months.
 */
export function dueDateISO(monthKey, dueDay) {
  const total = daysInMonth(monthKey);
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), total);
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

/** "2026-09-04" | Date -> "2026-09". */
export function monthKeyOf(dateLike) {
  if (dateLike instanceof Date) {
    return `${dateLike.getFullYear()}-${String(dateLike.getMonth() + 1).padStart(2, '0')}`;
  }
  const text = String(dateLike);
  if (isMonthKey(text)) return text;
  if (isDayKey(text)) return text.slice(0, 7);
  throw new TypeError(`Cannot derive month key from: ${JSON.stringify(dateLike)}`);
}

/** Day-of-month for a day key. */
export function dayOfMonth(dayKey) {
  if (!isDayKey(dayKey)) throw new TypeError(`Invalid day key: ${JSON.stringify(dayKey)}`);
  return Number(dayKey.slice(8, 10));
}

/** Today in the machine's local timezone as "YYYY-MM-DD". */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthKey(now = new Date()) {
  return monthKeyOf(now);
}

/** -1 | 0 | 1 — month keys sort correctly as plain strings. */
export function compareMonthKeys(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/** Inclusive list of month keys from `fromKey` to `toKey`. */
export function monthRange(fromKey, toKey) {
  const span = monthsBetween(fromKey, toKey);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addMonths(fromKey, i));
}

/** "2026-09" -> "September 2026". */
export function formatMonthLabel(key) {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "2026-09" -> "Sep 2026". */
export function formatMonthShort(key) {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

/** "2026-09-04" -> "4 Sep 2026". */
export function formatDayLabel(dayKey) {
  if (!isDayKey(dayKey)) return String(dayKey ?? '');
  const { month, year } = parseMonthKey(dayKey.slice(0, 7));
  return `${dayOfMonth(dayKey)} ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}
