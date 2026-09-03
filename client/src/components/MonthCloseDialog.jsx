/**
 * Enhanced MonthCloseDialog: Intuitive month closing workflow with preview
 */
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck, PiggyBank, AlertTriangle, Sparkles, ArrowDownRight, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import {
  applySuggestion,
  closeMonth as previewClose,
  closeMonthInStore,
  formatMonthLabel,
  getMonth,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { Modal } from './Modal.jsx';
import { Badge, Banner, Button, Field, TextInput } from './ui.jsx';

export default function MonthCloseDialog({ open, onClose, monthId }) {
  const { store, money, apply, setActiveMonthId } = useStore();
  const month = getMonth(store, monthId);
  const [recoveryMonths, setRecoveryMonths] = useState(3);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);

  const preview = useMemo(
    () => (month && month.status === 'open' ? previewClose(month, { recoveryMonths }) : null),
    [month, recoveryMonths],
  );

  const pendingCount = month ? month.bills.filter((bill) => bill.status === 'pending').length : 0;

  function close() {
    setError(null);
    try {
      const result = apply((store_) => closeMonthInStore(store_, monthId, { recoveryMonths }));
      setOutcome(result);
    } catch (caught) {
      setError(caught.message);
    }
  }

  function finish() {
    const next = outcome?.nextMonthId;
    setOutcome(null);
    onClose();
    if (next) setActiveMonthId(next);
  }

  function acceptSuggestion() {
    apply((store_) => applySuggestion(store_, outcome.suggestion, outcome.nextMonthId));
    finish();
  }

  if (!month) return null;

  const rows = preview ? [
    { label: 'Total Income', value: preview.income, type: 'income' },
    { label: 'Bills & Actual Spending', value: -preview.actualExpenses, type: 'expense' },
    { label: 'Allocated to Savings', value: -preview.actualSavings, type: 'savings' },
  ] : [];

  const surplus = outcome?.result > 0;
  const shortfall = outcome?.result < 0;

  // Step two: The month is closed, now decide what to do with the outcome
  if (outcome) {
    return (
      <Modal
        open={open}
        onClose={finish}
        title={`${formatMonthLabel(monthId)} is now closed`}
        subtitle="Here's what was left over. Would you like to roll it forward?"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" className="w-full sm:w-auto" onClick={finish}>Not now</Button>
            {outcome.suggestion?.type !== 'none' && (
              <Button variant="primary" onClick={acceptSuggestion} data-autofocus className="w-full sm:w-auto">
                {shortfall ? 'Start Recovery Plan' : 'Transfer to Savings'}
              </Button>
            )}
          </>
        )}
      >
        <div className="space-y-5">
          <div className={`p-4 rounded-2xl ${
            surplus
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/40'
              : shortfall
                ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40'
                : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              {surplus && <ArrowDownRight size={18} className="text-emerald-600 dark:text-emerald-400" />}
              {shortfall && <ArrowUpRight size={18} className="text-amber-600 dark:text-amber-400" />}
              {!surplus && !shortfall && <CheckCircle2 size={18} className="text-slate-500" />}
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Final Net Result
              </span>
            </div>
            <p className={`tnum text-3xl font-bold ${
              surplus ? 'text-emerald-700 dark:text-emerald-400' : shortfall ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
            }`}>
              {money(outcome.result)}
            </p>
          </div>

          <div className="space-y-2">
            {surplus && (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                You have a surplus! You can sweep it into your general savings pool to build up reserves.
              </p>
            )}
            {shortfall && (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                You're short by {money(Math.abs(outcome.result))}. Setting up a recovery plan will spread this evenly over the next {outcome.suggestion.months} months to balance your budget.
              </p>
            )}
            {!surplus && !shortfall && (
              <p className="text-sm text-slate-700 dark:text-slate-300">The month came out exactly even — nice balance!</p>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            <CalendarCheck size={12} className="inline mr-1" />
            {formatMonthLabel(outcome.nextMonthId)} has been created and its bills generated automatically.
          </p>
        </div>
      </Modal>
    );
  }

  // Step one: Review the month and close
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Close ${formatMonthLabel(monthId)}?`}
      subtitle="This will finalize the month's figures, credit your savings, and automatically open the next month."
      footer={(
        <>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>Keep it open</Button>
          <Button variant="primary" icon={CalendarCheck} onClick={close} data-autofocus className="w-full sm:w-auto shadow-md shadow-indigo-500/20">
            Confirm & Close Month
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {month.status === 'closed' && (
          <Banner variant="info" title="Already Closed">This month's books are already finalized.</Banner>
        )}

        {pendingCount > 0 && (
          <Banner variant="warn" icon={AlertTriangle} title={`${pendingCount} pending bill${pendingCount > 1 ? 's' : ''}`}>
            Pending bills will use their estimates in the final totals. Confirm them for accuracy first if possible.
          </Banner>
        )}

        {/* Reconciliation table */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
          {rows.map(({ label, value, type }, index) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${
                index > 0 ? 'border-t border-slate-100 dark:border-slate-800/80' : ''
              }`}
            >
              <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
              <span className={`tnum text-sm font-bold ${
                type === 'income'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}>
                {money(value)}
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between gap-4 px-4 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
            <span className="font-bold text-slate-800 dark:text-slate-100">Final Balance</span>
            <span className={`tnum text-xl font-bold ${
              (preview?.result ?? 0) < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {money(preview?.result ?? 0)}
            </span>
          </div>
        </div>

        {preview?.result < 0 && (
          <Field label="Spread the shortfall over (months)" htmlFor="recovery-span">
            <TextInput
              id="recovery-span"
              type="number"
              min={1}
              max={24}
              inputMode="numeric"
              value={recoveryMonths}
              onChange={(event) => setRecoveryMonths(Number(event.target.value) || 1)}
              className="h-11"
            />
          </Field>
        )}

        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <PiggyBank size={14} className="text-indigo-500 flex-shrink-0" />
          <span>Any planned savings and RD installments get credited automatically when the month closes.</span>
        </div>

        {error && <Banner variant="error" title="Could not close">{error}</Banner>}
      </div>
    </Modal>
  );
}
