/** Currency and number formatting. Pure — the store's currency is passed in. */
import { CURRENCIES, DEFAULT_CURRENCY } from '@expense/shared';

const meta = (currency) => CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];
const cache = new Map();

function formatter(currency, options) {
  const key = `${currency}:${JSON.stringify(options)}`;
  if (!cache.has(key)) {
    const { locale, code } = meta(currency);
    cache.set(key, new Intl.NumberFormat(locale, { style: 'currency', currency: code, ...options }));
  }
  return cache.get(key);
}

/**
 * Money for reading: whole units when the value is round, two decimals when the
 * paise actually matter (the daily allowance usually does).
 */
export function formatMoney(value, currency = DEFAULT_CURRENCY, { decimals } = {}) {
  const number = Number(value) || 0;
  const fraction = decimals ?? (Number.isInteger(number) ? 0 : 2);
  return formatter(currency, { minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(number);
}

/** Always shows a sign — for results, deltas and the month-close figure. */
export function formatSigned(value, currency = DEFAULT_CURRENCY) {
  const number = Number(value) || 0;
  const text = formatMoney(Math.abs(number), currency);
  if (number > 0) return `+${text}`;
  if (number < 0) return `−${text}`;
  return text;
}

/** Short form for axis labels and tight chips: ₹18K, ₹1.2L. */
export function formatCompact(value, currency = DEFAULT_CURRENCY) {
  return formatter(currency, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export function currencySymbol(currency = DEFAULT_CURRENCY) {
  return meta(currency).symbol;
}

/** Parse what someone typed into an amount box: "1,250.50", "₹1250", " 1250 ". */
export function parseAmount(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const cleaned = String(text ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function formatPercent(ratio, digits = 0) {
  return `${(Number(ratio) * 100 || 0).toFixed(digits)}%`;
}
