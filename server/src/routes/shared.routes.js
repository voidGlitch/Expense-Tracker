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
      const cashPaymentsSeen = new Set();
      const ensure = (currency) => {
        const key = currency || 'INR';
        byCurrency[key] ||= emptyCurrency();
        return byCurrency[key];
      };

      for (const context of loaded) {
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
            if (debt.to === req.user.id) totals.receivable = round2(totals.receivable + debt.amount);
            if (debt.from === req.user.id) totals.payable = round2(totals.payable + debt.amount);
          }
        }

        for (const leg of context.settlements) {
          if (cashPaymentsSeen.has(leg.batchId || leg.id)) continue;
          cashPaymentsSeen.add(leg.batchId || leg.id);
          const settlement = leg.batchId ? { ...leg, id: leg.batchId, amount: leg.cashAmount, fromUserId: leg.cashFromUserId, toUserId: leg.cashToUserId } : leg;
          const totals = ensure(settlement.currency);
          if (settlement.fromUserId === req.user.id) {
            totals.settlementSent = round2(totals.settlementSent + settlement.amount);
            transactions.push({
              id: `settlement-sent:${settlement.id}:${req.user.id}`,
              sourceType: 'settlement_sent', sourceId: settlement.id, contextType: context.type, contextId: context.id, contextTitle: context.title,
              date: settlement.date, description: 'Settlement sent', category: 'Settlement', currency: settlement.currency,
              amount: settlement.amount, personalShare: 0, receivable: 0, payable: -settlement.amount, netBalance: settlement.amount,
            });
          }
          if (settlement.toUserId === req.user.id) {
            totals.settlementReceived = round2(totals.settlementReceived + settlement.amount);
            transactions.push({
              id: `settlement-received:${settlement.id}:${req.user.id}`,
              sourceType: 'settlement_received', sourceId: settlement.id, contextType: context.type, contextId: context.id, contextTitle: context.title,
              date: settlement.date, description: 'Settlement received', category: 'Settlement', currency: settlement.currency,
              amount: settlement.amount, personalShare: 0, receivable: -settlement.amount, payable: 0, netBalance: -settlement.amount,
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

      transactions.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.sourceId).localeCompare(String(a.sourceId)));
      res.json({
        totals: byCurrency,
        transactions,
        monthly,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) { next(error); }
  });

  return router;
}

