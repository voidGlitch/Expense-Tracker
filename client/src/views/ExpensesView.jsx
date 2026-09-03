/**
2 * Enhanced ExpensesView: Everything logged this month with search, category filtering,
3 * group headers, and enhanced cards
4 */
import { useMemo, useState } from 'react';
import { Pencil, Plus, Receipt, Search, Trash2, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';
import {
  deleteTransaction,
  formatDayLabel,
  formatMonthLabel,
  isDiscretionaryCategory,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { ExpenseFormModal } from '../components/ExpenseForm.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import {
  Badge, Button, Card, CardHeader, EmptyState, Select, Stat, TextInput,
} from '../components/ui.jsx';

export default function ExpensesView() {
  const { month, summary, money, apply, activeMonthId } = useStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'expense', 'income'
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const transactions = month?.transactions || [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions.filter((txn) => {
      if (category !== 'all' && txn.category !== category) return false;
      if (typeFilter !== 'all' && txn.type !== typeFilter) return false;
      if (!needle) return true;
      return `${txn.note || ''} ${txn.category || ''} ${txn.date || ''}`.toLowerCase().includes(needle);
    });
  }, [transactions, query, category, typeFilter]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const txn of filtered) {
      if (!byDate.has(txn.date)) byDate.set(txn.date, []);
      byDate.get(txn.date).push(txn);
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
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

  const used = [...new Set(transactions.map((txn) => txn.category))].sort();
  const isClosed = month.status === 'closed';

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pool Spend</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(summary.discretionarySpent)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Counts toward daily allowance</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">All Logged</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(summary.loggedExpenses)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.transactionCount} entries recorded</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Remaining</span>
          <p className={`mt-2 text-2xl font-bold tnum ${summary.remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {money(summary.remaining)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.daysLeft} days to go</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Entries for {formatMonthLabel(activeMonthId)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isClosed ? 'This month is closed — entries are view-only.' : 'Organized chronologically'}
            </p>
          </div>
          {!isClosed && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Add Expense
            </Button>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800">
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
                    {formatDayLabel(date)}
                  </h3>
                </div>

                <div className="space-y-2">
                  {txns.map((txn) => (
                    <div
                      key={txn.id}
                      className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-white p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-950/40 dark:hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`flex items-center justify-center size-9 rounded-xl flex-shrink-0 ${
                          txn.type === 'income'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {txn.type === 'income' ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {txn.note || txn.category}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>{txn.category}</span>
                            <span>•</span>
                            {txn.type === 'income' ? (
                              <Badge variant="success" size="sm">Income</Badge>
                            ) : isDiscretionaryCategory(txn.category) ? (
                              <Badge variant="warning" size="sm">Discretionary</Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">Non-Pool</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={`tnum text-base font-bold ${
                          txn.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}>
                          {txn.type === 'income' ? '+' : '-'}{money(txn.amount)}
                        </span>

                        {!isClosed && (
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Pencil}
                              onClick={() => setEditing(txn)}
                              aria-label="Edit entry"
                              className="size-8 p-0"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              onClick={() => setRemoving(txn)}
                              aria-label="Delete entry"
                              className="size-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
