import { computeSplits, splitsTotal } from '../data/expense.js';
import { minor, major, participantShares } from './money.js';

export const EPSILON = 0.005;
const live = (row) => !row.deletedAt;
export const expenseSplits = (expense) => expense.splits?.length ? expense.splits : computeSplits(expense.amount, expense.splitMethod, expense.participants, expense.splitDetails);
const shares = (expense) => participantShares({ ...expense, splits: expenseSplits(expense) });
const currencies = (expenses, settlements = []) => [...new Set([...expenses, ...settlements].filter(live).map((row) => row.currency || 'INR'))];
const inCurrency = (rows, currency) => rows.filter((row) => (row.currency || 'INR') === currency);
const singleCurrency = (expenses, settlements) => {
  if (currencies(expenses, settlements).length > 1) throw new Error('Calculate each currency separately.');
};

/** Positive = owed to this person. Arithmetic before presentation is integer. */
export function netBalances(expenses = [], settlements = []) {
  singleCurrency(expenses, settlements);
  const balances = new Map();
  const adjust = (id, amount) => { if (id) balances.set(String(id), (balances.get(String(id)) || 0) + amount); };
  for (const expense of expenses.filter(live)) for (const row of shares(expense)) adjust(row.memberId, minor(row.netShare));
  for (const payment of settlements.filter(live)) {
    adjust(payment.fromUserId, minor(payment.amount));
    adjust(payment.toUserId, -minor(payment.amount));
  }
  return new Map([...balances].map(([id, amount]) => [id, major(amount)]));
}
export const netBalancesObject = (expenses = [], settlements = []) => Object.fromEntries(netBalances(expenses, settlements));

/** Deterministic greedy simplification preserves every participant's net. */
export function simplifyDebts(balances = {}) {
  const entries = balances instanceof Map ? [...balances] : Object.entries(balances);
  const debtors = entries.filter(([, value]) => minor(value) < 0).map(([id, value]) => ({ id, amount: -minor(value) }));
  const creditors = entries.filter(([, value]) => minor(value) > 0).map(([id, value]) => ({ id, amount: minor(value) }));
  const sort = (a, b) => b.amount - a.amount || a.id.localeCompare(b.id);
  debtors.sort(sort); creditors.sort(sort);
  const result = [];
  let d = 0; let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    result.push({ from: debtors[d].id, to: creditors[c].id, amount: major(amount) });
    debtors[d].amount -= amount; creditors[c].amount -= amount;
    if (!debtors[d].amount) d++;
    if (!creditors[c].amount) c++;
  }
  return result;
}

/** Net each expense's payments against consumption, then net opposite pairs. */
export function pairwiseBalances(expenses = [], settlements = []) {
  singleCurrency(expenses, settlements);
  const pairs = new Map();
  const bump = (from, to, amount) => {
    if (!from || !to || from === to) return;
    const [a, b] = [from, to].sort();
    const key = JSON.stringify([a, b]);
    pairs.set(key, (pairs.get(key) || 0) + minor(amount) * (from === a ? 1 : -1));
  };
  for (const expense of expenses.filter(live)) {
    for (const debt of simplifyDebts(Object.fromEntries(shares(expense).map((row) => [row.memberId, row.netShare])))) bump(debt.from, debt.to, debt.amount);
  }
  for (const payment of settlements.filter(live)) bump(payment.toUserId, payment.fromUserId, payment.amount);
  return [...pairs].filter(([, value]) => value !== 0).map(([key, value]) => {
    const [a, b] = JSON.parse(key);
    return { from: value > 0 ? a : b, to: value > 0 ? b : a, amount: major(Math.abs(value)) };
  });
}

export function balanceWith(expenses, settlements, meId, otherId) {
  const pair = pairwiseBalances(expenses, settlements).find((row) => (row.from === meId && row.to === otherId) || (row.to === meId && row.from === otherId));
  return pair ? { direction: pair.from === meId ? 'youOwe' : 'owesYou', amount: pair.amount, to: otherId } : { direction: 'settled', amount: 0 };
}

export function totalsPerCurrency(expenses = [], meId) {
  const out = {};
  for (const expense of expenses.filter(live)) {
    const row = out[expense.currency || 'INR'] ||= { paid: 0, share: 0, total: 0, count: 0 };
    const mine = shares(expense).find((part) => part.memberId === meId);
    row.paid = major(minor(row.paid) + minor(mine?.paidShare));
    row.share = major(minor(row.share) + minor(mine?.owedShare));
    row.total = major(minor(row.total) + minor(expense.amount) * (expense.kind === 'refund' ? -1 : 1));
    row.count++;
  }
  return out;
}

export function totalsWith(expenses, settlements, meId, otherId) {
  const mine = totalsPerCurrency(expenses, meId); const theirs = totalsPerCurrency(expenses, otherId);
  const byCurrency = {};
  for (const currency of currencies(expenses, settlements)) {
    const balance = balanceWith(inCurrency(expenses, currency), inCurrency(settlements, currency), meId, otherId);
    byCurrency[currency] = { youPaid: mine[currency]?.paid || 0, theyPaid: theirs[currency]?.paid || 0, yourShare: mine[currency]?.share || 0, theirShare: theirs[currency]?.share || 0, net: balance.amount * (balance.direction === 'youOwe' ? -1 : 1) };
  }
  const scalar = Object.keys(byCurrency).length <= 1 ? Object.values(byCurrency)[0] || { youPaid: 0, theyPaid: 0, yourShare: 0, theirShare: 0, net: 0 } : {};
  return { ...scalar, byCurrency, expenseCount: expenses.filter(live).length, settlementCount: settlements.filter(live).length };
}

export function summaryFor(expenses = [], settlements = [], meId) {
  const perCurrency = totalsPerCurrency(expenses, meId);
  for (const currency of currencies(expenses, settlements)) {
    const pairs = pairwiseBalances(inCurrency(expenses, currency), inCurrency(settlements, currency));
    const youOwe = major(pairs.filter((row) => row.from === meId).reduce((sum, row) => sum + minor(row.amount), 0));
    const youAreOwed = major(pairs.filter((row) => row.to === meId).reduce((sum, row) => sum + minor(row.amount), 0));
    perCurrency[currency] = { ...perCurrency[currency], youOwe, youAreOwed, netBalance: major(minor(youAreOwed) - minor(youOwe)) };
  }
  const scalar = Object.keys(perCurrency).length <= 1 ? Object.values(perCurrency)[0] || { youOwe: 0, youAreOwed: 0, netBalance: 0 } : {};
  return { ...scalar, perCurrency, expenseCount: expenses.filter(live).length, settlementCount: settlements.filter(live).length };
}
export const balancesAreConsistent = (expenses, settlements) => currencies(expenses, settlements).every((currency) => [...netBalances(inCurrency(expenses, currency), inCurrency(settlements, currency)).values()].reduce((sum, amount) => sum + minor(amount), 0) === 0);
export { splitsTotal };
