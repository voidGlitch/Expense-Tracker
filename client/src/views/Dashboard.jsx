/**
 * Enhanced Dashboard (FR12/FR13): Modern visualization of spending status,
 * daily allowance, bills, and recent activity
 */
import { useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, BadgeIndianRupee, CalendarCheck,
  CreditCard, PiggyBank, Receipt, SlidersHorizontal, TrendingDown, TrendingUp,
  Wallet, Sparkles, CheckCircle2, Clock, AlertTriangle
} from 'lucide-react';
import {
  categoryBreakdown,
  confirmBillInStore,
  dailySpendSeries,
  formatMonthLabel,
  deleteBillInStore,
  updateMonthPlan,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { CategoryDoughnut, PaceChart } from '../components/charts.jsx';
import { BillList } from '../components/BillList.jsx';
import { BudgetBreakdown } from '../components/BudgetBreakdown.jsx';
import { Modal } from '../components/Modal.jsx';
import {
  Badge, Banner, Button, Card, CardHeader, EmptyState, Field, MoneyInput, ProgressBar, Select, Stat,
} from '../components/ui.jsx';
import MonthCloseDialog from '../components/MonthCloseDialog.jsx';

const WARN_TONE = { danger: 'error', warn: 'warn', info: 'info' };

/** Per-month numbers that are not bills: income, RD, recovery, savings target. */
function MonthPlanModal({ open, onClose, month, currency, apply }) {
  const [draft, setDraft] = useState(month);

  const field = (key, label, hint) => (
    <Field label={label} hint={hint} htmlFor={`plan-${key}`}>
      <MoneyInput
        id={`plan-${key}`}
        currency={currency}
        value={draft[key]}
        onChange={(value) => setDraft((prev) => ({ ...prev, [key]: value }))}
      />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Plan for ${formatMonthLabel(month.id)}`}
      subtitle="Bills come from your definitions — these are the rest of the month's numbers."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              apply((store) => updateMonthPlan(store, month.id, draft));
              onClose();
            }}
          >
            Save plan
          </Button>
        </>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('income', 'Monthly income')}
        {field('extraIncome', 'Extra income', 'Bonus, refunds, side work.')}
        {field('rdInstallment', 'RD installment')}
        {field('savingsTarget', 'Savings target')}
        {field('recoveryInstallment', 'Recovery installment', 'Repaying an earlier overspend.')}
      </div>
    </Modal>
  );
}

export default function Dashboard({ onAddExpense, navigate }) {
  const { store, month, summary, warnings, savings, currency, money, apply, activeMonthId, setActiveMonthId, sharedBudgetError } = useStore();
  const [editingPlan, setEditingPlan] = useState(false);
  const [closing, setClosing] = useState(false);

  const breakdown = useMemo(() => (month ? categoryBreakdown(month) : []), [month]);
  const series = useMemo(() => (month ? dailySpendSeries(month) : []), [month]);
  const recent = useMemo(() => (month ? [...month.transactions].slice(0, 5) : []), [month]);

  if (!month) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState
          icon={CalendarCheck}
          title="That month is not in your budget yet"
          action={null}
        >
          Pick another month from the dropdown, or log something with a date in this one.
        </EmptyState>
      </Card>
    );
  }

  const isClosed = month.status === 'closed';
  const allowanceTone = summary.overspent ? 'red' : (summary.dynamic < summary.static * 0.6 ? 'amber' : 'green');

  return (
    <div className="space-y-6">
      {sharedBudgetError && <Banner variant="warn">Shared spending could not refresh. Budget totals may be incomplete: {sharedBudgetError}</Banner>}
      {/* Warnings & Alerts */}
      {warnings.map((warning) => (
        <Banner key={warning.code} variant={WARN_TONE[warning.level] || 'info'}>
          {warning.message}
        </Banner>
      ))}

      {/* Hero Section - Safe to Spend / Closed Month */}
      {isClosed ? (
        <Card variant="elevated" className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white border-0">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex size-2 rounded-full bg-slate-400" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Closed Month Summary</p>
                </div>
                <p className="text-3xl sm:text-4xl font-bold tnum">
                  {money(month.closing?.result ?? 0)}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {(month.closing?.result ?? 0) >= 0 ? 'Surplus carried forward' : 'Deficit to recover next month'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('history')}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                View full history <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/20">
          {/* Background decorative elements */}
          <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-purple-500/20 blur-3xl" />

          <div className="relative z-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                    {summary.isCurrentMonth ? 'Safe to Spend Today' : 'Daily Allowance'}
                  </p>
                </div>
                <p className="text-4xl sm:text-5xl font-bold tracking-tight tnum text-white">
                  {money(Math.max(summary.dynamic, 0), { decimals: 2 })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-indigo-200">
                  <span>{money(summary.remaining)} left for {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'}</span>
                  <span>•</span>
                  <span>Target pace: {money(summary.static, { decimals: 2 })}/day</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Select month"
                  value={activeMonthId}
                  onChange={(event) => setActiveMonthId(event.target.value)}
                  className="h-9 w-auto min-w-[10rem] border-white/30 bg-white/10 py-0 text-xs font-semibold text-white"
                >
                  {(store.months || []).map((item) => <option key={item.id || item} value={item.id || item}>{formatMonthLabel(item.id || item)}</option>)}
                </Select>
                <button
                  type="button"
                  onClick={() => setEditingPlan(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-xs font-semibold text-white transition-colors"
                >
                  <SlidersHorizontal size={14} />
                  <span>Plan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClosing(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 text-xs font-semibold shadow-md transition-colors"
                >
                  <CalendarCheck size={14} />
                  <span>Close Month</span>
                </button>
              </div>
            </div>

            {/* Progress Section */}
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs font-medium text-indigo-200">
                <span>Discretionary Pool</span>
                <span>{Math.round(summary.monthProgress * 100)}% of month elapsed</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/20 backdrop-blur-sm">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    allowanceTone === 'red' ? 'bg-rose-400' : allowanceTone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(Math.max((summary.discretionarySpent / Math.max(summary.pool, 1)) * 100, 0), 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-indigo-200">
                <span>{money(summary.discretionarySpent)} spent</span>
                <span>{money(summary.pool)} total pool</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Income</span>
            <div className="flex items-center justify-center size-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Wallet size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(summary.totalIncome)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.extraIncome ? `+${money(summary.extraIncome)} extra` : 'Base salary'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Committed</span>
            <div className="flex items-center justify-center size-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Receipt size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(summary.commitments)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.billsCount} bills • {money(summary.plannedSavings)} savings
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Spending Pool</span>
            <div className={`flex items-center justify-center size-9 rounded-xl ${summary.pool < 0 ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'}`}>
              <BadgeIndianRupee size={18} />
            </div>
          </div>
          <p className={`mt-3 text-2xl font-bold tnum ${summary.pool < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {money(summary.pool)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            For free spending
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Saved</span>
            <div className="flex items-center justify-center size-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <PiggyBank size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(savings.totalSaved)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            RD & general savings
          </p>
        </div>
      </div>

      <BudgetBreakdown month={month} summary={summary} money={money} />

      {/* Main Grid: Bills & Visual Analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bills Section */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Monthly Bills</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {summary.pendingBillsCount ? `${summary.pendingBillsCount} remaining to confirm` : 'All bills settled'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('bills')}>
              Manage
            </Button>
          </div>
          <div className="p-2 flex-1">
            <BillList
              bills={month.bills}
              currency={currency}
              money={money}
              readOnly={isClosed}
              onConfirm={(instanceId, amount) => apply((store) => confirmBillInStore(store, activeMonthId, instanceId, amount))}
              onDelete={(instanceId) => apply((store) => deleteBillInStore(store, activeMonthId, instanceId))}
              emptyHint={store.billDefinitions.length === 0 ? 'Add your bills once and they appear here every month.' : undefined}
            />
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-6">
          {/* Spending Breakdown */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Spending Breakdown</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{summary.transactionCount} entries recorded</p>
              </div>
            </div>

            {breakdown.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expenses logged"
              >
                Log your transactions to see a category-wise breakdown.
              </EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
                <div className="flex justify-center">
                  <CategoryDoughnut breakdown={breakdown} currency={currency} className="size-32" />
                </div>
                <ul className="space-y-2">
                  {breakdown.slice(0, 5).map((slice) => (
                    <li key={slice.category} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300 font-medium">{slice.category}</span>
                      <span className="tnum font-semibold text-slate-900 dark:text-slate-100">{money(slice.amount)}</span>
                      <span className="tnum w-12 text-right text-slate-400">{slice.share}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Spending Pace Chart */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Spending Pace</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Actual vs ideal daily burn rate</p>
              </div>
            </div>
            <div className="h-44">
              <PaceChart series={series} currency={currency} />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent Transactions</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Latest activity this month</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('expenses')}>
            View all
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={Receipt} title="No transactions yet">
              Open Spending to record your first transaction.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {recent.map((txn) => (
              <li key={txn.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center size-9 rounded-xl ${
                    txn.type === 'income'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {txn.type === 'income' ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {txn.note || txn.category}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {txn.date} • {txn.category}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`tnum text-sm font-bold ${
                    txn.type === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}>
                    {txn.type === 'income' ? '+' : '-'}{money(txn.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modals */}
      {editingPlan && (
        <MonthPlanModal
          open={editingPlan}
          onClose={() => setEditingPlan(false)}
          month={month}
          currency={currency}
          apply={apply}
        />
      )}

      <MonthCloseDialog open={closing} onClose={() => setClosing(false)} monthId={activeMonthId} />
    </div>
  );
}
