/**
 * Expense Manager projection of the shared-expense ledger.
 *
 * This deliberately does not copy shared rows into the personal budget
 * document. The ledger is the financial source of truth; this endpoint is a
 * read model keyed by sourceType/sourceId. Consequently an edit, deletion or
 * settlement is reflected everywhere on the very next read with no orphaned
 * "personal transaction" to clean up.
 */
import { Router } from 'express';
import { dailyAllowance, discretionaryPool, expenseSplits, loggedExpensesTotal, pairwiseBalances, participantShares, sharedBudgetEntries, withSharedBudget, simplifyDebts, netBalancesObject } from '@expense/shared';
import { userLedgers, overview } from './readModels.js';
import { ledgerContext, ledgerRows } from './ledger.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function emptyCurrency() {
  return {
    personalExpense: 0,
    cashPaid: 0,
    receivable: 0,
    payable: 0,
    settlementSent: 0,
    settlementReceived: 0,
    currentCashImpact: 0,
  };
}

function effectForExpense(expense, userId) {
  const mine = participantShares({ ...expense, splits: expenseSplits(expense) }).find((row) => row.memberId === userId);
  const personalShare = mine?.owedShare || 0;
  const amountPaidByCurrentUser = mine?.paidShare || 0;
  const netBalance = round2(amountPaidByCurrentUser - personalShare);
  return {
    id: `shared-expense:${expense.id}:${userId}`,
    sourceType: 'shared_expense',
    sourceId: expense.id,
    contextType: expense.contextType,
    contextId: expense.contextId,
    date: expense.date,
    description: expense.description,
    category: expense.category,
    currency: expense.currency,
    totalAmount: round2(expense.amount),
    personalShare,
    amountPaidByCurrentUser,
    amountPaid: amountPaidByCurrentUser,
    // These are the effect introduced by this expense. The outstanding values
    // in `totals` below include settlements and are what the UI uses for debt.
    receivable: Math.max(0, netBalance),
    payable: Math.max(0, -netBalance),
    netBalance,
  };
}

/**
 * Match repayments to expense balances in chronological order. A payment can
 * close only the still-unallocated balance for its direction. This prevents
 * historical settlements from inheriting the title of a newly added expense
 * merely because their amounts happen to fit it.
 */
function settlementExpenseMap(context, userId) {
  const expenses = context.expenses
    .map((expense) => {
      const effect = effectForExpense(expense, userId);
      return { expense, effect, remaining: Math.abs(effect.netBalance) };
    })
    .filter((row) => row.remaining > 0.005)
    .sort((a, b) => String(a.expense.date || '').localeCompare(String(b.expense.date || ''))
      || String(a.expense.createdAt || '').localeCompare(String(b.expense.createdAt || ''))
      || String(a.expense.id || '').localeCompare(String(b.expense.id || '')));
  const payments = [];
  const seen = new Set();
  for (const leg of context.settlements) {
    const key = leg.batchId || leg.id;
    if (seen.has(key)) continue;
    seen.add(key);
    payments.push(leg.batchId
      ? { ...leg, id: leg.batchId, amount: leg.cashAmount, fromUserId: leg.cashFromUserId, toUserId: leg.cashToUserId }
      : leg);
  }
  payments.sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    || String(a.id || '').localeCompare(String(b.id || '')));

  const result = new Map();
  for (const payment of payments) {
    const direction = payment.fromUserId === userId ? -1 : payment.toUserId === userId ? 1 : 0;
    if (!direction) continue;
    let remaining = Number(payment.amount || 0);
    const matched = [];
    for (const row of expenses) {
      if (remaining <= 0.005) break;
      if (Math.sign(row.effect.netBalance) !== direction || row.remaining <= 0.005) continue;
      const allocated = Math.min(row.remaining, remaining);
      row.remaining = round2(row.remaining - allocated);
      remaining = round2(remaining - allocated);
      if (allocated > 0.005) matched.push(row.expense);
    }
    if (matched.length === 1) result.set(payment.id, matched[0]);
  }
  return result;
}

export function sharedRoutes() {
  const router = Router();
  router.get('/overview', async (req, res, next) => {
    try { res.json(overview(await userLedgers(req.repo, req.user.id, { includeDeleted: true }), req.user.id)); }
    catch (error) { next(error); }
  });
  router.get('/export', async (req, res, next) => {
    try {
      const context = await ledgerContext(req.repo, req.query.contextType, req.query.contextId, req.user.id);
      const rows = await ledgerRows(req.repo, context, { includeDeleted: true });
      const quote = (value) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
      const header = ['Type', 'ID', 'Date', 'Description', 'Currency', 'Amount', 'Your paid share', 'Your owed share', 'Deleted', 'From', 'To'];
      const data = rows.expenses.map((expense) => {
        const mine = participantShares({ ...expense, splits: expenseSplits(expense) }).find((r) => r.memberId === req.user.id);
        return [expense.kind || 'expense', expense.id, expense.date, expense.description, expense.currency, expense.amount, mine?.paidShare || 0, mine?.owedShare || 0, expense.deletedAt || '', '', ''];
      });
      data.push(...rows.settlements.map((r) => ['payment', r.batchId || r.id, r.date, r.note, r.currency, r.amount, '', '', r.deletedAt || '', r.fromUserId, r.toUserId]));
      res.type('text/csv').attachment('shared-expenses.csv').send([header, ...data].map((row) => row.map(quote).join(',')).join('\r\n'));
    } catch (error) { next(error); }
  });

  router.get('/summary', async (req, res, next) => {
    try {
      const loaded = await userLedgers(req.repo, req.user.id);

      const byCurrency = {};
      const transactions = [];
      const openPositions = [];
      const cashPaymentsSeen = new Set();
      const ensure = (currency) => {
        const key = currency || 'INR';
        byCurrency[key] ||= emptyCurrency();
        return byCurrency[key];
      };

      for (const context of loaded) {
        const relatedExpenses = settlementExpenseMap(context, req.user.id);
        for (const expense of context.expenses) {
          const effect = effectForExpense(expense, req.user.id);
          // A member may view a group expense without participating in it. It
          // belongs in group activity, but not in their Expense Manager.
          if (effect.personalShare === 0 && effect.amountPaidByCurrentUser === 0) continue;
          const totals = ensure(effect.currency);
          totals.personalExpense = round2(totals.personalExpense + effect.personalShare);
          totals.cashPaid = round2(totals.cashPaid + effect.amountPaidByCurrentUser);
          transactions.push({ ...effect, contextTitle: context.title });
        }

        // Keep each friendship/group financially separate before adding its
        // outstanding pairwise debt to the personal manager projection.
        const currencies = new Set([...context.expenses, ...context.settlements].map((row) => row.currency || 'INR'));
        for (const currency of currencies) {
          const expenses = context.expenses.filter((row) => (row.currency || 'INR') === currency);
          const settlements = context.settlements.filter((row) => (row.currency || 'INR') === currency);
          for (const debt of context.simplify ? simplifyDebts(netBalancesObject(expenses, settlements)) : pairwiseBalances(expenses, settlements)) {
            const totals = ensure(currency);
            if (debt.amount > 0 && (debt.to === req.user.id || debt.from === req.user.id)) {
              const receivable = debt.to === req.user.id;
              const otherId = receivable ? debt.from : debt.to;
              openPositions.push({
                id: `${context.type}:${context.id}:${currency}:${debt.from}:${debt.to}`,
                contextType: context.type, contextId: context.id, contextTitle: context.title,
                personId: otherId, personName: context.members.find((member) => member.id === otherId)?.name || 'Member',
                currency, amount: round2(debt.amount), direction: receivable ? 'receivable' : 'payable',
              });
            }
            if (debt.to === req.user.id) totals.receivable = round2(totals.receivable + debt.amount);
            if (debt.from === req.user.id) totals.payable = round2(totals.payable + debt.amount);
          }
        }

        for (const leg of context.settlements) {
          if (cashPaymentsSeen.has(leg.batchId || leg.id)) continue;
          cashPaymentsSeen.add(leg.batchId || leg.id);
          const settlement = leg.batchId ? { ...leg, id: leg.batchId, amount: leg.cashAmount, fromUserId: leg.cashFromUserId, toUserId: leg.cashToUserId } : leg;
          const relatedExpense = relatedExpenses.get(settlement.id);
          const totals = ensure(settlement.currency);
          if (settlement.fromUserId === req.user.id) {
            totals.settlementSent = round2(totals.settlementSent + settlement.amount);
            transactions.push({
              id: `settlement-sent:${settlement.id}:${req.user.id}`,
              sourceType: 'settlement_sent', sourceId: settlement.id, contextType: context.type, contextId: context.id, contextTitle: context.title,
              date: settlement.date, description: relatedExpense?.description || settlement.note || 'Shared expense settlement', category: relatedExpense?.category || 'Settlement', currency: settlement.currency,
              fromUserId: settlement.fromUserId, toUserId: settlement.toUserId, amount: settlement.amount, personalShare: 0, receivable: 0, payable: -settlement.amount, netBalance: settlement.amount,
            });
          }
          if (settlement.toUserId === req.user.id) {
            totals.settlementReceived = round2(totals.settlementReceived + settlement.amount);
            transactions.push({
              id: `settlement-received:${settlement.id}:${req.user.id}`,
              sourceType: 'settlement_received', sourceId: settlement.id, contextType: context.type, contextId: context.id, contextTitle: context.title,
              date: settlement.date, description: relatedExpense?.description || settlement.note || 'Settlement received', category: relatedExpense?.category || 'Settlement', currency: settlement.currency,
              fromUserId: settlement.fromUserId, toUserId: settlement.toUserId, amount: settlement.amount, personalShare: 0, receivable: -settlement.amount, payable: 0, netBalance: -settlement.amount,
            });
          }
        }
      }

      for (const values of Object.values(byCurrency)) {
        values.remainingReceivable = round2(values.receivable);
        values.remainingPayable = round2(values.payable);
        values.settledAmount = round2(values.settlementSent + values.settlementReceived);
        values.currentCashImpact = round2(values.cashPaid + values.settlementSent - values.settlementReceived);
      }

      let monthly = null;
      const monthId = String(req.query.monthId || '').trim();
      if (monthId) {
        const doc = await req.repo.getDocument(req.user.id);
        const month = (doc.store.months || []).find((row) => row.id === monthId);
        if (month) {
          const monthlyByCurrency = {};
          for (const [currency, values] of Object.entries(byCurrency)) {
            const sharedRows = transactions.filter((row) => row.currency === currency && String(row.date || '').startsWith(monthId));
            const cashPaid = sharedRows.filter((row) => row.sourceType === 'shared_expense').reduce((sum, row) => round2(sum + row.amountPaidByCurrentUser), 0);
            const settlementSent = sharedRows.filter((row) => row.sourceType === 'settlement_sent').reduce((sum, row) => round2(sum + row.amount), 0);
            const settlementReceived = sharedRows.filter((row) => row.sourceType === 'settlement_received').reduce((sum, row) => round2(sum + row.amount), 0);
            const personalExpense = sharedRows.filter((row) => row.sourceType === 'shared_expense').reduce((sum, row) => round2(sum + row.personalShare), 0);
            monthlyByCurrency[currency] = {
              personalExpense,
              cashPaid,
              settlementSent,
              settlementReceived,
              currentCashImpact: round2(cashPaid + settlementSent - settlementReceived),
              remainingReceivable: values.remainingReceivable,
              remainingPayable: values.remainingPayable,
            };
          }
          const primaryCurrency = doc.store.settings?.currency || 'INR';
          const sharedCashImpact = monthlyByCurrency[primaryCurrency]?.currentCashImpact || 0;
          const normalSpending = loggedExpensesTotal(month);
          const budgetEntries = sharedBudgetEntries(loaded.flatMap((context) => context.expenses), req.user.id, monthId, primaryCurrency);
          budgetEntries.push(...transactions.filter((row) => row.currency === primaryCurrency && String(row.date || '').startsWith(monthId) && ['settlement_sent', 'settlement_received'].includes(row.sourceType)).map((row) => ({
            id: `shared:${row.sourceId}:${req.user.id}`,
            sourceId: row.sourceId,
            sourceType: row.sourceType,
            shared: true,
            date: row.date,
            type: 'expense',
            amount: row.sourceType === 'settlement_received' ? -Number(row.amount || 0) : Number(row.amount || 0),
            category: row.sourceType === 'settlement_received' ? 'Repayment credit' : `${row.description || 'Shared expense'} (shared expense)`,
            note: row.description,
            currency: row.currency,
          })));
          const projectedMonth = withSharedBudget(month, budgetEntries);
          const currentSpending = loggedExpensesTotal(projectedMonth);
          monthly = {
            monthId,
            currency: primaryCurrency,
            normalSpending,
            sharedCashImpact,
            currentSpending,
            budgetPool: discretionaryPool(month),
            // Match the personal budget/export. Shared cash impact is exposed
            // separately and must not be deducted from the allowance again.
            remaining: dailyAllowance(projectedMonth).remaining,
            budgetEntries,
            byCurrency: monthlyByCurrency,
          };
        }
      }

      const uniqueTransactions = [];
      const seenTransactionSources = new Set();
      for (const transaction of transactions) {
        const key = `${transaction.sourceType}:${transaction.sourceId}`;
        if (seenTransactionSources.has(key)) continue;
        seenTransactionSources.add(key);
        uniqueTransactions.push(transaction);
      }
      transactions.length = 0;
      transactions.push(...uniqueTransactions);
      transactions.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.sourceId).localeCompare(String(a.sourceId)));
      res.json({
        totals: byCurrency,
        openPositions,
        transactions,
        monthly,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) { next(error); }
  });

  return router;
}

