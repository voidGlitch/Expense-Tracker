/**
 * Balance engine (SRS §8-§10).
 *
 * Balances are DERIVED, never stored. Given the same expenses and settlements
 * this always produces the same answer, so a corrected expense can never leave
 * a stale cached total behind.
 *
 * Sign convention, used everywhere:
 *   positive balance  -> that person is OWED money (they paid more than their share)
 *   negative balance  -> that person OWES money
 * A person's balance plus everyone else's is always zero.
 */
import { SPLIT_METHOD } from '../data/config.js';
import { computeSplits, splitsTotal } from '../data/expense.js';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(num(value) * 100) / 100;

/** Ignore sub-paise noise so a float artefact never shows as a real debt. */
export const EPSILON = 0.005;

const isLive = (row) => !row?.deletedAt;

/**
 * Every split on an expense, computed if the row did not store them.
 * Older rows (or a hand-written expense) still balance correctly.
 */
export function expenseSplits(expense) {
  if (Array.isArray(expense.splits) && expense.splits.length > 0) {
    return expense.splits.map((split) => ({ memberId: String(split.memberId), amount: round2(split.amount) }));
  }
  return computeSplits(
    expense.amount,
    expense.splitMethod || SPLIT_METHOD.EQUAL,
    expense.participants || [],
    expense.splitDetails || {},
  );
}

/**
 * Net balance for every person touched by these rows.
 *
 * An expense credits the payer the full amount and debits each participant
 * their share. A settlement moves value from payer to recipient without
 * changing anyone's net worth, which is exactly what a real payment does.
 */
export function netBalances(expenses = [], settlements = []) {
  const balances = new Map();

  const adjust = (id, delta) => {
    if (!id) return;
    const key = String(id);
    balances.set(key, round2((balances.get(key) || 0) + delta));
  };

  for (const expense of expenses) {
    if (!isLive(expense) || !(num(expense.amount) > 0)) continue;
    adjust(expense.paidBy, num(expense.amount));
    for (const split of expenseSplits(expense)) adjust(split.memberId, -split.amount);
  }

  for (const settlement of settlements) {
    if (!isLive(settlement) || !(num(settlement.amount) > 0)) continue;
    adjust(settlement.fromUserId, num(settlement.amount));
    adjust(settlement.toUserId, -num(settlement.amount));
  }

  return balances;
}

/** Same as `netBalances` but as a plain object, for JSON responses and tests. */
export function netBalancesObject(expenses = [], settlements = []) {
  return Object.fromEntries(netBalances(expenses, settlements));
}

/**
 * Direct person-to-person debts — who owes whom, netted.
 *
 * Each expense creates a debt from every participant to the payer; a settlement
 * cancels debt in the opposite direction. Opposite-direction pairs are netted
 * per §9, so you see "Amit owes Rahul 200" rather than two cancelling rows.
 */
export function pairwiseBalances(expenses = [], settlements = []) {
  // key: "debtor->creditor" -> amount owed
  const debts = new Map();
  const bump = (from, to, amount) => {
    if (!from || !to || from === to) return;
    const key = `${from}->${to}`;
    debts.set(key, round2((debts.get(key) || 0) + amount));
  };

  for (const expense of expenses) {
    if (!isLive(expense)) continue;
    const payer = String(expense.paidBy || '');
    if (!payer) continue;
    for (const split of expenseSplits(expense)) {
      if (split.memberId !== payer) bump(split.memberId, payer, split.amount);
    }
  }

  for (const settlement of settlements) {
    if (!isLive(settlement)) continue;
    bump(settlement.toUserId, settlement.fromUserId, num(settlement.amount));
  }

  // Net each pair once, in whichever direction ends up positive.
  const result = [];
  const seen = new Set();
  for (const [key, owed] of debts) {
    const [from, to] = key.split('->');
    const reverse = `${to}->${from}`;
    if (seen.has(key) || seen.has(reverse)) continue;
    seen.add(key);
    seen.add(reverse);
    const net = round2(owed - (debts.get(reverse) || 0));
    if (net > EPSILON) result.push({ from, to, amount: net });
    else if (net < -EPSILON) result.push({ from: to, to: from, amount: Math.abs(net) });
  }
  return result;
}

/**
 * Reduce debts to the fewest transfers (SRS §10).
 *
 * Repeatedly settles the largest debtor against the largest creditor. Everyone
 * with a debt to give pays someone who is owed, so no chain needs to pass
 * through a middleman. Net balances are preserved exactly.
 */
export function simplifyDebts(balances = {}) {
  const map = balances instanceof Map ? balances : new Map(Object.entries(balances));
  const debtors = [];
  const creditors = [];

  for (const [id, raw] of map) {
    const value = round2(raw);
    if (value < -EPSILON) debtors.push({ id, amount: Math.abs(value) });
    else if (value > EPSILON) creditors.push({ id, amount: value });
  }

  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers = [];
  let d = 0;
  let c = 0;
  // Bounded by debtors + creditors: each pass either clears a debt or a credit.
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = round2(Math.min(debtor.amount, creditor.amount));
    if (amount > EPSILON) transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);
    if (debtor.amount <= EPSILON) d += 1;
    if (creditor.amount <= EPSILON) c += 1;
  }
  return transfers;
}

/**
 * How one person stands against another — the number the friendship header
 * shows ("John owes you 1,250" / "You owe John 800" / settled).
 */
export function balanceWith(expenses, settlements, meId, otherId) {
  const me = String(meId);
  const other = String(otherId);
  const pair = pairwiseBalances(expenses, settlements)
    .find((row) => (row.from === me && row.to === other) || (row.from === other && row.to === me));

  if (!pair) return { direction: 'settled', amount: 0 };
  if (pair.from === me) return { direction: 'youOwe', amount: pair.amount, to: other };
  return { direction: 'owesYou', amount: pair.amount, to: other };
}

/**
 * Totals for a two-person view (SRS §12): what each side paid in, and what
 * each side's own share of the spending was.
 */
export function totalsWith(expenses, settlements, meId, otherId) {
  const me = String(meId);
  const other = String(otherId);
  const out = {
    youPaid: 0, theyPaid: 0, yourShare: 0, theirShare: 0, net: 0,
    expenseCount: 0, settlementCount: 0, byCurrency: {},
  };

  for (const expense of expenses) {
    if (!isLive(expense) || !(num(expense.amount) > 0)) continue;
    const currency = expense.currency || 'INR';
    out.byCurrency[currency] = out.byCurrency[currency] || { youPaid: 0, theyPaid: 0, yourShare: 0, theirShare: 0 };
    out.expenseCount += 1;

    const bucket = out.byCurrency[currency];
    if (String(expense.paidBy) === me) { out.youPaid = round2(out.youPaid + num(expense.amount)); bucket.youPaid = round2(bucket.youPaid + num(expense.amount)); }
    if (String(expense.paidBy) === other) { out.theyPaid = round2(out.theyPaid + num(expense.amount)); bucket.theyPaid = round2(bucket.theyPaid + num(expense.amount)); }

    for (const split of expenseSplits(expense)) {
      if (split.memberId === me) { out.yourShare = round2(out.yourShare + split.amount); bucket.yourShare = round2(bucket.yourShare + split.amount); }
      if (split.memberId === other) { out.theirShare = round2(out.theirShare + split.amount); bucket.theirShare = round2(bucket.theirShare + split.amount); }
    }
  }

  out.settlementCount = settlements.filter(isLive).length;
  const { direction, amount } = balanceWith(expenses, settlements, me, other);
  out.net = direction === 'owesYou' ? amount : direction === 'youOwe' ? -amount : 0;
  return out;
}

/**
 * The dashboard headline: what I owe, what I am owed, and my net position.
 * Only live, non-settled relationships contribute.
 */
export function summaryFor(expenses, settlements, meId) {
  const me = String(meId);
  const live = (expenses || []).filter(isLive);
  const settled = (settlements || []).filter(isLive);

  const pairs = pairwiseBalances(live, settled);
  let youOwe = 0;
  let youAreOwed = 0;
  for (const row of pairs) {
    if (row.from === me) youOwe = round2(youOwe + row.amount);
    else if (row.to === me) youAreOwed = round2(youAreOwed + row.amount);
  }

  const all = netBalances(live, settled);
  return {
    youOwe,
    youAreOwed,
    netBalance: round2(youAreOwed - youOwe),
    expenseCount: live.length,
    settlementCount: settled.length,
    perCurrency: totalsPerCurrency(live, me),
  };
}

/** Spending grouped by currency, so INR and USD are never silently added. */
export function totalsPerCurrency(expenses, meId) {
  const me = String(meId);
  const out = {};
  for (const expense of expenses) {
    if (!isLive(expense) || !(num(expense.amount) > 0)) continue;
    const currency = expense.currency || 'INR';
    const mine = expenseSplits(expense).find((split) => split.memberId === me);
    const row = out[currency] || { paid: 0, share: 0, total: 0, count: 0 };
    row.total = round2(row.total + num(expense.amount));
    if (String(expense.paidBy) === me) row.paid = round2(row.paid + num(expense.amount));
    if (mine) row.share = round2(row.share + mine.amount);
    row.count += 1;
    out[currency] = row;
  }
  return out;
}

/** Consistency check used by tests: every balance set must sum to zero. */
export function balancesAreConsistent(expenses, settlements) {
  const total = [...netBalances(expenses, settlements).values()]
    .reduce((acc, value) => acc + value, 0);
  return Math.abs(total) < EPSILON;
}

export { splitsTotal };
