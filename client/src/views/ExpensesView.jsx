/**
2 * Enhanced ExpensesView: Everything logged this month with search, category filtering,
3 * group headers, and enhanced cards
4 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Receipt, Search, Trash2, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';
import {
  deleteTransaction,
  budgetBreakdown,
  formatDayLabel,
  formatMonthLabel,
  isDiscretionaryCategory,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { ExpenseFormModal } from '../components/ExpenseForm.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import {
  Badge, Banner, Button, Card, CardHeader, EmptyState, Select, Stat, TextInput,
} from '../components/ui.jsx';
import { sharedExpenseEntries, sharedRepaymentEntries } from './sharedExpenseUi.js';
import { BudgetBreakdown } from '../components/BudgetBreakdown.jsx';
import './spending.css';

export default function ExpensesView() {
  const { month, summary, money, apply, activeMonthId, currency, sharedBudgetError } = useStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'expense', 'income'
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [shared, setShared] = useState(null);
  const [sharedError, setSharedError] = useState('');

  const sharedRequest = useRef(0);
  const loadShared = useCallback(async () => {
    const request = ++sharedRequest.current;
    try {
      const result = await api.getSharedSummary(activeMonthId);
      if (request !== sharedRequest.current) return;
      setShared(result);
      setSharedError('');
    } catch (cause) {
      if (request !== sharedRequest.current) return;
      setShared(null);
      setSharedError(cause.message);
    }
  }, [activeMonthId]);

  useEffect(() => {
    setShared(null);
    setSharedError('');
    loadShared();
    window.addEventListener('shared-ledger-updated', loadShared);
    return () => {
      ++sharedRequest.current;
      window.removeEventListener('shared-ledger-updated', loadShared);
    };
  }, [loadShared]);

  const transactions = month?.transactions || [];
  const sharedPersonalEntries = useMemo(() => [...sharedExpenseEntries(shared, activeMonthId), ...sharedRepaymentEntries(shared, activeMonthId)], [shared, activeMonthId]);
  const repaymentTotals = useMemo(() => {
    const repayments = (shared?.transactions || []).filter((txn) => String(txn.date || '').startsWith(activeMonthId || '') && Number(txn.amount) > 0);
    const received = repayments.filter((txn) => txn.sourceType === 'settlement_received').reduce((total, txn) => total + Number(txn.amount || 0), 0);
    const sent = repayments.filter((txn) => txn.sourceType === 'settlement_sent').reduce((total, txn) => total + Number(txn.amount || 0), 0);
    return { received, sent };
  }, [shared, activeMonthId]);
  const budgetSummary = useMemo(() => summary ? ({
    ...summary,
    discretionarySpent: summary.discretionarySpent - repaymentTotals.received + repaymentTotals.sent,
    remaining: summary.remaining + repaymentTotals.received - repaymentTotals.sent,
  }) : summary, [summary, repaymentTotals]);
  const visibleTransactions = useMemo(() => {
    const seen = new Set();
    return [...transactions, ...sharedPersonalEntries].filter((row) => {
      const key = row.sourceId ? `source:${row.sourceId}` : `id:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [transactions, sharedPersonalEntries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleTransactions.filter((txn) => {
      if (category !== 'all' && txn.category !== category) return false;
      if (typeFilter !== 'all' && txn.type !== typeFilter) return false;
      if (!needle) return true;
      return `${txn.note || ''} ${txn.category || ''} ${txn.date || ''}`.toLowerCase().includes(needle);
    });
  }, [visibleTransactions, query, category, typeFilter]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const txn of filtered) {
      const date = txn.date || '';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(txn);
    }
    return [...byDate.entries()].sort((a, b) => String(b[0] || '').localeCompare(String(a[0] || '')));
  }, [filtered]);

  if (!month) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState icon={Receipt} title="Nothing here yet">
          Pick a month that exists in your budget to view or add expenses.
        </EmptyState>
      </Card>
    );
  }

  const used = [...new Set(visibleTransactions.map((txn) => txn.category))].sort();
  const isClosed = month.status === 'closed';
  // These are the personal budget totals used by Home and the Excel export.
  // Shared cash transfers belong to the separate ledger, not daily allowance.
  const currentSpent = summary.loggedExpenses;
  const currentRemaining = budgetSummary.remaining;
  const sharedLogged = (shared?.transactions || []).filter((txn) => txn.sourceType === 'shared_expense' && String(txn.date || '').startsWith(activeMonthId || '')).reduce((sum, txn) => sum + Number(txn.personalShare || 0), 0);

  return (
    <div className="spending-view">
      <header className="spending-title"><div><h1>Spending</h1><p>{formatMonthLabel(activeMonthId)} · Your monthly expenses</p></div><Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)}>Add expense</Button></header>
      {sharedBudgetError && <Banner variant="warn">Shared spending could not refresh. Budget totals may be incomplete: {sharedBudgetError}</Banner>}
      {/* Top Stats */}
      <div className="spending-stats">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pool Spend</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(budgetSummary.discretionarySpent)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Day-to-day spending</p>
          <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-indigo-600">View breakdown</summary><div className="mt-2 space-y-1">{budgetBreakdown(month).spending.map((row) => <div key={row.label} className="flex justify-between gap-3"><span>{row.label}</span><span>{money(row.amount)}</span></div>)}</div></details>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">All Logged</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(currentSpent)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Personal: {money(Math.max(0, currentSpent - sharedLogged))} · Shared: {money(sharedLogged)}</p>
          <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-indigo-600">View breakdown</summary><div className="mt-2 space-y-1"><div className="flex justify-between"><span>Personal expenses</span><span>{money(Math.max(0, currentSpent - sharedLogged))}</span></div><div className="flex justify-between"><span>Shared expenses</span><span>{money(sharedLogged)}</span></div></div></details>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Remaining</span>
          <p className={`mt-2 text-2xl font-bold tnum ${currentRemaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {money(currentRemaining)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">After day-to-day spending · {summary.daysLeft} days left</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="spending-entries rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="spending-entries-heading flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Entries
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isClosed ? 'This month is closed — entries are view-only.' : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} · newest first`}
            </p>
          </div>
          {!isClosed && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Add Expense
            </Button>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="spending-filters flex flex-wrap items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <TextInput
              className="pl-9 h-10 bg-white dark:bg-slate-950"
              placeholder="Search by note, category, or date..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search entries"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-auto bg-white dark:bg-slate-950"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {used.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>

            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-10 w-auto bg-white dark:bg-slate-950"
              aria-label="Filter by type"
            >
              <option value="all">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Income Only</option>
              <option value="repayment">Repayments</option>
            </Select>
          </div>
        </div>

        {/* Entries List */}
        {groups.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={Search} title="No entries found">
              {query || category !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your search filters.'
                : 'No transactions recorded for this month yet.'}
            </EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {groups.map(([date, txns]) => (
              <div key={date} className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="size-1.5 rounded-full bg-slate-400 dark:bg-slate-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {date ? formatDayLabel(date) : 'Unknown date'}
                  </h3>
                </div>

                <div className="space-y-2">
                  {txns.map((txn) => (
                    <div
                      key={txn.id}
                      className="spending-entry group flex items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-white p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-950/40 dark:hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`flex items-center justify-center size-9 rounded-xl flex-shrink-0 ${
                          (txn.type === 'income' || txn.credit)
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {(txn.type === 'income' || txn.credit) ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {txn.note || txn.category}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>{txn.category}</span>
                            <span>•</span>
                            {txn.repayment ? (
                              <Badge variant={txn.credit ? "success" : "neutral"} size="sm">{txn.credit ? "Credit · repayment" : "Debit · repayment"}</Badge>
                            ) : txn.shared ? (
                              <Badge variant="neutral" size="sm">Shared expense</Badge>
                            ) : (txn.type === 'income' || txn.credit) ? (
                              <Badge variant="success" size="sm">Income</Badge>
                            ) : isDiscretionaryCategory(txn.category) ? (
                              <Badge variant="warning" size="sm">Discretionary</Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">Non-Pool</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="spending-entry-amount flex items-center gap-4">
                        <span className={`tnum text-base font-bold ${
                          (txn.type === 'income' || txn.credit)
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}>
                          {(txn.type === 'income' || txn.credit) ? '+' : '-'}{txn.shared ? formatMoney(txn.amount, txn.sharedDetail.currency || currency) : money(txn.amount)}
                        </span>

                        {!isClosed && !txn.shared && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Pencil}
                              onClick={() => setEditing(txn)}
                              aria-label={`Edit ${txn.note || txn.category}`}
                              className="h-8 px-2 text-slate-700 dark:text-slate-200"
                            >Edit</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              onClick={() => setRemoving(txn)}
                              aria-label={`Delete ${txn.note || txn.category}`}
                              className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            >Delete</Button>
                          </div>
                        )}
                      </div>
                      {txn.shared && txn.sharedDetail && <p className="spending-entry-origin mt-1 text-xs text-slate-500">{txn.repayment ? "Repayment · excluded from income; affects Discretionary spent" : txn.cashPaid ? `Cash paid into ${txn.sharedDetail.contextTitle || "shared ledger"}; receivable tracked separately` : `Personal share from ${txn.sharedDetail.contextTitle || "shared ledger"}`}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="spending-breakdown"><BudgetBreakdown month={month} summary={budgetSummary} money={money} repaymentCredits={repaymentTotals.received} repaymentDebits={repaymentTotals.sent} /></div>

      {/* Derived from the authoritative shared-expense ledger. These values are
          deliberately separate from normal personal transactions: a bill you
          fronted is not all personal spending, and a receivable is not income. */}
      <section className="spending-shared rounded-2xl border border-teal-100 bg-teal-50/60 p-4 dark:border-teal-900/70 dark:bg-teal-950/20 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100">Shared expense position</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Your share is included in spending above. Received repayments show as credits; sent repayments show as debits.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadShared}>Refresh</Button>
        </div>
        {sharedError ? <p className="mt-3 text-sm text-rose-600">Unable to load shared expenses: {sharedError}</p> : !shared ? <p className="mt-3 text-sm text-slate-500">Loading shared balances...</p> : Object.keys(shared.totals || {}).length === 0 ? <p className="mt-3 text-sm text-slate-500">No shared expenses affect your Expense Manager yet.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(shared.totals).map(([currency, values]) => <div key={currency} className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"><p className="text-xs font-semibold text-slate-500">{currency} shared</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">Personal share {formatMoney(values.personalExpense, currency)}</p><p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">Cash impact {formatMoney(values.currentCashImpact || 0, currency)}</p><p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Receivable {formatMoney(values.receivable, currency)}</p><p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">Payable {formatMoney(values.payable, currency)}</p></div>)}</div>}
        {shared?.transactions?.length > 0 && <div className="mt-4 divide-y divide-teal-100 rounded-xl bg-white dark:divide-slate-800 dark:bg-slate-900">{shared.transactions.slice(0, 4).map((txn) => <div key={txn.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-slate-900 dark:text-slate-100">{txn.description}</p><p className="text-xs text-slate-500">{txn.sourceType === 'shared_expense' ? `${txn.category} · personal share` : txn.sourceType === 'settlement_sent' ? 'Settlement payment · debit' : 'Settlement repayment · credit'}</p></div><div className="shrink-0 text-right"><p className={`font-bold ${txn.sourceType === "settlement_received" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{txn.sourceType === "settlement_received" ? "+" : txn.sourceType === "settlement_sent" ? "−" : ""}{formatMoney(txn.sourceType === 'shared_expense' ? txn.personalShare : txn.amount, txn.currency)}</p>{txn.receivable > 0 && <p className="text-xs text-emerald-700">Receivable {formatMoney(txn.receivable, txn.currency)}</p>}{txn.payable > 0 && <p className="text-xs text-rose-700">Payable {formatMoney(txn.payable, txn.currency)}</p>}</div></div>)}</div>}
      </section>

      {/* Edit Modal */}
      {editing && (
        <ExpenseFormModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          monthId={activeMonthId}
          initial={editing}
        />
      )}

      {/* Add Modal */}
      {adding && (
        <ExpenseFormModal
          open={adding}
          onClose={() => setAdding(false)}
          monthId={activeMonthId}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            apply((store) => deleteTransaction(store, activeMonthId, removing.id));
            setRemoving(null);
          }
        }}
        title="Delete transaction?"
        confirmLabel="Delete"
        variant="danger"
      >
        Are you sure you want to delete this transaction of {removing ? money(removing.amount) : ''}? This action cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
