/**
 * Splitwise calculation engine
 * Handles expense splitting, net balance calculation, debt simplification, and settlements.
 */

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round2 = (v) => Math.round(num(v) * 100) / 100;

/**
 * Split an expense among participants according to splitType:
 * - 'equal': divides total equally among participants
 * - 'exact': uses explicit amount per participant
 * - 'percentage': uses percentage per participant
 * - 'shares': splits proportionally based on shares count
 *
 * @param {number} totalAmount - Total amount of the expense
 * @param {string} splitType - 'equal' | 'exact' | 'percentage' | 'shares'
 * @param {Array<string>} memberIds - List of member user/friend IDs
 * @param {Object} details - Optional custom amounts, percentages, or shares { [memberId]: number }
 * @returns {Array<{ memberId: string, amount: number }>} Splits per member
 */
export function calculateSplits(totalAmount, splitType = 'equal', memberIds = [], details = {}) {
  const total = round2(totalAmount);
  if (!memberIds || memberIds.length === 0 || total <= 0) return [];

  const count = memberIds.length;

  if (splitType === 'equal') {
    const baseShare = Math.floor((total / count) * 100) / 100;
    let remainder = Math.round((total - baseShare * count) * 100);

    return memberIds.map((id, index) => {
      const extra = remainder > 0 ? 0.01 : 0;
      if (remainder > 0) remainder -= 1;
      return { memberId: id, amount: round2(baseShare + extra) };
    });
  }

  if (splitType === 'exact') {
    return memberIds.map((id) => ({
      memberId: id,
      amount: round2(details[id] || 0),
    }));
  }

  if (splitType === 'percentage') {
    return memberIds.map((id) => {
      const pct = num(details[id], 0);
      return { memberId: id, amount: round2((total * pct) / 100) };
    });
  }

  if (splitType === 'shares') {
    const totalShares = memberIds.reduce((sum, id) => sum + Math.max(1, Math.trunc(num(details[id], 1))), 0);
    if (totalShares <= 0) return calculateSplits(total, 'equal', memberIds);

    return memberIds.map((id) => {
      const shares = Math.max(1, Math.trunc(num(details[id], 1)));
      return { memberId: id, amount: round2((total * shares) / totalShares) };
    });
  }

  return calculateSplits(total, 'equal', memberIds);
}

/**
 * Computes net balances for all members across a set of expenses and settlements.
 * Positive balance = member is owed money (they paid more than their share).
 * Negative balance = member owes money (they paid less than their share).
 *
 * @param {Array<Object>} expenses - List of expense objects
 * @param {Array<Object>} settlements - List of settlement objects
 * @returns {Object} Map of { [memberId]: netBalance }
 */
export function calculateNetBalances(expenses = [], settlements = []) {
  const balances = {};

  const adjust = (id, delta) => {
    if (!id) return;
    balances[id] = round2((balances[id] || 0) + delta);
  };

  // Process expenses
  for (const exp of expenses) {
    const paidBy = exp.paidBy;
    const amount = round2(exp.amount);
    if (!paidBy || amount <= 0) continue;

    // Credit payer
    adjust(paidBy, amount);

    // Debit each participant for their share
    const splits = Array.isArray(exp.splits) ? exp.splits : [];
    for (const split of splits) {
      adjust(split.memberId, -round2(split.amount));
    }
  }

  // Process settlements (from person paid to person)
  for (const set of settlements) {
    const from = set.fromMemberId || set.from;
    const to = set.toMemberId || set.to;
    const amount = round2(set.amount);
    if (!from || !to || amount <= 0) continue;

    // 'from' paid 'to', so 'from's debt decreases (balance goes up), 'to's credit decreases (balance goes down)
    adjust(from, amount);
    adjust(to, -amount);
  }

  return balances;
}

/**
 * Simplified Debt Settlement Algorithm (Minimizes number of transactions)
 * Matches maximum debtor with maximum creditor iteratively.
 *
 * @param {Object} netBalances - Map of { [memberId]: netBalance }
 * @param {Object} memberNames - Optional map of { [memberId]: name }
 * @returns {Array<{ from: string, to: string, amount: number, fromName?: string, toName?: string }>}
 */
export function simplifyDebts(netBalances = {}, memberNames = {}) {
  const debtors = [];
  const creditors = [];

  for (const [id, rawBal] of Object.entries(netBalances)) {
    const bal = round2(rawBal);
    if (bal < -0.01) {
      debtors.push({ id, amount: Math.abs(bal) });
    } else if (bal > 0.01) {
      creditors.push({ id, amount: bal });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];

  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];

    const settledAmount = Math.min(debtor.amount, creditor.amount);
    if (settledAmount > 0.01) {
      transactions.push({
        from: debtor.id,
        to: creditor.id,
        fromName: memberNames[debtor.id] || debtor.id,
        toName: memberNames[creditor.id] || creditor.id,
        amount: round2(settledAmount),
      });
    }

    debtor.amount = round2(debtor.amount - settledAmount);
    creditor.amount = round2(creditor.amount - settledAmount);

    if (debtor.amount <= 0.01) d += 1;
    if (creditor.amount <= 0.01) c += 1;
  }

  return transactions;
}

/**
 * Calculates pairwise balances between all members.
 * Returns a map of who owes whom directly.
 */
export function calculatePairwiseBalances(expenses = [], settlements = []) {
  // map key: "from->to" => amount owed
  const pairOwes = new Map();

  const addDebt = (from, to, amount) => {
    if (!from || !to || from === to || amount <= 0) return;
    const key = `${from}->${to}`;
    pairOwes.set(key, round2((pairOwes.get(key) || 0) + amount));
  };

  for (const exp of expenses) {
    const payer = exp.paidBy;
    const splits = Array.isArray(exp.splits) ? exp.splits : [];
    for (const split of splits) {
      if (split.memberId !== payer) {
        addDebt(split.memberId, payer, split.amount);
      }
    }
  }

  for (const set of settlements) {
    const from = set.fromMemberId || set.from;
    const to = set.toMemberId || set.to;
    const amount = round2(set.amount);
    // Settlement from A to B reduces A's debt to B
    const key = `${from}->${to}`;
    pairOwes.set(key, round2((pairOwes.get(key) || 0) - amount));
  }

  // Net out bilateral pairs
  const result = [];
  const processed = new Set();

  for (const [key, rawAmount] of pairOwes.entries()) {
    const [from, to] = key.split('->');
    const reverseKey = `${to}->${from}`;
    if (processed.has(key) || processed.has(reverseKey)) continue;

    const forward = pairOwes.get(key) || 0;
    const reverse = pairOwes.get(reverseKey) || 0;
    const net = round2(forward - reverse);

    if (net > 0.01) {
      result.push({ from, to, amount: net });
    } else if (net < -0.01) {
      result.push({ from: to, to: from, amount: Math.abs(net) });
    }

    processed.add(key);
    processed.add(reverseKey);
  }

  return result;
}

/**
 * Get summary stats for the current user across all Splitwise groups/friends.
 */
export function getSplitwiseSummary(userId = 'self', groups = [], expenses = [], settlements = []) {
  const netBalances = calculateNetBalances(expenses, settlements);
  const myBalance = round2(netBalances[userId] || 0);

  let totalYouOwe = 0;
  let totalYouAreOwed = 0;

  for (const [memberId, bal] of Object.entries(netBalances)) {
    if (memberId === userId) continue;
    if (bal > 0.01) {
      // Someone is owed overall
    }
  }

  // Calculate direct pairwise debts involving current user
  const pairs = calculatePairwiseBalances(expenses, settlements);
  for (const p of pairs) {
    if (p.from === userId) {
      totalYouOwe = round2(totalYouOwe + p.amount);
    } else if (p.to === userId) {
      totalYouAreOwed = round2(totalYouAreOwed + p.amount);
    }
  }

  return {
    netBalance: myBalance,
    totalYouOwe,
    totalYouAreOwed,
    totalExpensesCount: expenses.length,
    groupsCount: groups.length,
  };
}
