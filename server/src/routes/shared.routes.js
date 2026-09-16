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
import { discretionaryPool, expenseSplits, loggedExpensesTotal, pairwiseBalances } from '@expense/shared';

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
  const personalShare = expenseSplits(expense)
    .filter((split) => split.memberId === String(userId))
    .reduce((sum, split) => round2(sum + split.amount), 0);
  const amountPaidByCurrentUser = String(expense.paidBy) === String(userId) ? round2(expense.amount) : 0;
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

  router.get('/summary', async (req, res, next) => {
    try {
      const [friendships, groups] = await Promise.all([
        req.repo.listFriendships(req.user.id),
        req.repo.listGroups(req.user.id),
      ]);
      const contexts = [
        ...friendships.map((row) => ({ type: 'friendship', id: row.id, title: 'Friendship' })),
        ...groups.map((row) => ({ type: 'group', id: row.id, title: row.name })),
      ];
      const loaded = await Promise.all(contexts.map(async (context) => ({
        ...context,
        expenses: await req.repo.listExpenses({ contextType: context.type, contextId: context.id }),
        settlements: await req.repo.listSettlements({ contextType: context.type, contextId: context.id }),
      })));

      const byCurrency = {};
      const transactions = [];
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
          if (effect.personalShare <= 0 && effect.amountPaidByCurrentUser <= 0) continue;
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
          for (const debt of pairwiseBalances(expenses, settlements)) {
            const totals = ensure(currency);
            if (debt.to === req.user.id) totals.receivable = round2(totals.receivable + debt.amount);
            if (debt.from === req.user.id) totals.payable = round2(totals.payable + debt.amount);
          }
        }

        for (const settlement of context.settlements) {
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
          const primaryCurrency = Object.keys(byCurrency)[0] || 'INR';
          const sharedCashImpact = monthlyByCurrency[primaryCurrency]?.currentCashImpact || 0;
          const normalSpending = loggedExpensesTotal(month);
          const currentSpending = round2(normalSpending + sharedCashImpact);
          monthly = {
            monthId,
            currency: primaryCurrency,
            normalSpending,
            sharedCashImpact,
            currentSpending,
            budgetPool: discretionaryPool(month),
            remaining: round2(discretionaryPool(month) - currentSpending),
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
