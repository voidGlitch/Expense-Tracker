/**
 * Enhanced SavingsView: Visual overview of savings buckets (RD, Recovery, General),
 * targets, interest growth, and milestones
 */
import { useMemo } from 'react';
import { PiggyBank, TrendingUp, Wallet, ShieldCheck, Target, ArrowRight } from 'lucide-react';
import { savingsOverview } from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import {
  Badge, Button, Card, CardHeader, EmptyState, ProgressBar, Stat,
} from '../components/ui.jsx';

export default function SavingsView() {
  const { store, money, currency } = useStore();

  const overview = useMemo(() => {
    if (!store) return null;
    return savingsOverview(store);
  }, [store]);

  if (!store) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState icon={PiggyBank} title="No budget loaded">
          Please set up your budget first.
        </EmptyState>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState icon={PiggyBank} title="Savings not configured">
          Go to settings or your monthly plan to configure your savings goals.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Savings & Investments</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Track your recurring deposits, emergency reserves, and debt recovery</p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-lg shadow-emerald-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Total Net Saved</span>
            <div className="flex items-center justify-center size-9 rounded-xl bg-white/10 backdrop-blur-sm">
              <Wallet size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tnum">{money(overview.totalSaved)}</p>
          <p className="mt-1 text-xs text-emerald-100">Across all accumulated savings buckets</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">RD Cumulative</span>
            <div className="flex items-center justify-center size-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{money(overview.rd.balance)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Interest rate: {overview.rd.rate || 0}% per annum</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Debt Recovery Balance</span>
            <div className={`flex items-center justify-center size-9 rounded-xl ${overview.recovery.balance > 0 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'}`}>
              <ShieldCheck size={18} />
            </div>
          </div>
          <p className={`mt-3 text-2xl font-bold tnum ${overview.recovery.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {money(overview.recovery.balance)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {overview.recovery.balance > 0 ? 'Pending recovery installments' : 'No debt pending'}
          </p>
        </div>
      </div>

      {/* Main Breakdown Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recurring Deposit Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recurring Deposit (RD)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fixed regular deposits</p>
              </div>
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tnum">
              {money(overview.rd.balance)}
            </span>
          </div>

          <div className="space-y-3 mt-6">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>Goal Progress</span>
              <span>{overview.rd.target ? `${Math.round((overview.rd.balance / overview.rd.target) * 100)}%` : 'Active'}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(Math.max((overview.rd.balance / Math.max(overview.rd.target || 1, overview.rd.balance)) * 100, 0), 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Current: {money(overview.rd.balance)}</span>
              <span>Target: {money(overview.rd.target || 0)}</span>
            </div>
          </div>
        </div>

        {/* Debt Recovery Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-10 rounded-xl ${overview.recovery.balance > 0 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'}`}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Deficit Recovery</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Automatic repayment of overspends</p>
              </div>
            </div>
            <span className={`text-lg font-bold tnum ${overview.recovery.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {money(overview.recovery.balance)}
            </span>
          </div>

          {overview.recovery.balance > 0 ? (
            <div className="space-y-3 mt-6">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>Repayment Status</span>
                <span>{money(overview.recovery.balance)} remaining</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${Math.min(Math.max((overview.recovery.balance / Math.max(overview.recovery.originalAmount || 1, overview.recovery.balance)) * 100, 0), 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paid off in monthly installments configured in your monthly plan.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300 text-xs mt-6">
              <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>Great job! You have no outstanding overspend recovery obligations.</span>
            </div>
          )}
        </div>
      </div>

      {/* General Savings Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <PiggyBank size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">General Reserves</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Unallocated surplus savings pool</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">
            {money(overview.general.balance)}
          </span>
        </div>
      </div>
    </div>
  );
}
