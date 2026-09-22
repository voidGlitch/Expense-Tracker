/**
 * Enhanced ExpenseFormModal: Modern logging interface
 */
import { useEffect, useMemo, useState } from 'react';
import {
  INCOME_CATEGORIES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPE,
  addTransaction,
  deleteTransaction,
  formatMonthLabel,
  isDiscretionaryCategory,
  monthKeyOf,
  todayKey,
  updateTransaction,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { Modal } from './Modal.jsx';
import { Button, Field, MoneyInput, Segmented, Select, TextInput, Badge, Banner } from './ui.jsx';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';

const TYPE_OPTIONS = [
  { id: TRANSACTION_TYPE.EXPENSE, label: 'Spent' },
  { id: TRANSACTION_TYPE.INCOME, label: 'Received' },
];

const blank = (monthId) => ({
  type: TRANSACTION_TYPE.EXPENSE,
  amount: null,
  category: 'Groceries',
  date: monthId && monthId !== monthKeyOf(todayKey()) ? `${monthId}-01` : todayKey(),
  note: '',
});

export function ExpenseFormModal({ open, onClose, monthId, initial = null }) {
  const { apply, currency, money } = useStore();
  const [draft, setDraft] = useState(() => initial || blank(monthId));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setDraft(initial || blank(monthId));
      setErrors({});
      setError(null);
    }
  }, [open, initial, monthId]);

  const patch = (updates) => setDraft((prev) => ({ ...prev, ...updates }));
  const isIncome = draft.type === TRANSACTION_TYPE.INCOME;
  const targetMonth = useMemo(() => (draft.date ? monthKeyOf(draft.date) : monthId), [draft.date, monthId]);

  function save() {
    setError(null);
    const found = {};
    if (!(Number(draft.amount) > 0)) found.amount = 'Enter an amount above zero.';
    if (!draft.date) found.date = 'Pick a date.';
    setErrors(found);
    if (Object.keys(found).length) return;

    try {
      if (initial?.id && targetMonth === monthId) {
        apply((store) => updateTransaction(store, monthId, initial.id, draft));
      } else if (initial?.id) {
        // Re-dated into another month: move it rather than leaving it behind.
        apply((store) => addTransaction(
          deleteTransaction(store, monthId, initial.id),
          targetMonth,
          { ...draft, id: initial.id },
        ));
      } else {
        apply((store) => addTransaction(store, monthId, draft));
      }
      onClose();
    } catch (caught) {
      setErrors(caught.fieldErrors || {});
      setError(caught.message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit Transaction' : 'Record Transaction'}
      subtitle={initial?.id ? 'Update the details of this entry' : 'Log a new expense or income'}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="w-full sm:w-auto" onClick={save}>{initial?.id ? 'Save changes' : 'Add to ledger'}</Button>
        </>
      )}
    >
      <div className="space-y-6">
        <div className="p-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <Segmented
            options={TYPE_OPTIONS}
            value={draft.type}
            variant="elevated"
            onChange={(type) => patch({
              type,
              category: type === TRANSACTION_TYPE.INCOME ? 'Bonus' : 'Groceries',
            })}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Amount" htmlFor="txn-amount" error={errors.amount} required>
            <MoneyInput
              id="txn-amount"
              data-autofocus
              currency={currency}
              value={draft.amount}
              onChange={(amount) => patch({ amount })}
              placeholder="0"
              error={errors.amount}
              className={`h-12 text-lg font-bold shadow-sm ${
                isIncome
                  ? 'text-emerald-700 bg-emerald-50/30 border-emerald-200 focus:ring-emerald-500/20 dark:bg-emerald-900/10 dark:text-emerald-400 dark:border-emerald-800'
                  : ''
              }`}
            />
          </Field>
          <Field label="Date" htmlFor="txn-date" error={errors.date} required>
            <TextInput
              id="txn-date"
              type="date"
              value={draft.date}
              onChange={(event) => patch({ date: event.target.value })}
              error={errors.date}
              className="h-12"
            />
          </Field>
        </div>

        <Field label="Category" htmlFor="txn-category">
          <Select
            id="txn-category"
            value={draft.category}
            onChange={(event) => patch({ category: event.target.value })}
            className="h-11"
          >
            {isIncome
              ? INCOME_CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)
              : TRANSACTION_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
          </Select>

          {!isIncome && (
            <div className={`mt-2 flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
              isDiscretionaryCategory(draft.category)
                ? 'bg-indigo-50/50 border-indigo-100 text-indigo-800 dark:bg-indigo-950/20 dark:border-indigo-900/30 dark:text-indigo-300'
                : 'bg-slate-50/50 border-slate-200 text-slate-600 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-400'
            }`}>
              <Info size={14} className="flex-shrink-0" />
              <span>
                {isDiscretionaryCategory(draft.category)
                  ? 'Counts against your daily spending allowance.'
                  : 'Does not affect your daily spending allowance.'}
              </span>
            </div>
          )}
        </Field>

        <Field label="Note / Description (Optional)" htmlFor="txn-note">
          <TextInput
            id="txn-note"
            placeholder="Supermarket, landlord, lunch..."
            maxLength={140}
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            className="h-11"
          />
        </Field>

        {targetMonth && targetMonth !== monthId && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-medium">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p>This date falls in {formatMonthLabel(targetMonth)}. Logging it will place it in that month's ledger, not the current view.</p>
          </div>
        )}

        {draft.amount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2">
            {isIncome ? <ArrowDownRight size={16} className="text-emerald-500" /> : <ArrowUpRight size={16} className="text-slate-400" />}
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isIncome ? 'Adding' : 'Deducting'} <span className={`tnum font-bold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{money(draft.amount)}</span> {isIncome ? 'to' : 'from'} {formatMonthLabel(targetMonth)}
            </p>
          </div>
        )}

        {error && <Banner variant="error" title="Could not save">{error}</Banner>}
      </div>
    </Modal>
  );
}
