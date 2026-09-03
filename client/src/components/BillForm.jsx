/**
 * Enhanced BillForm: Elegant modal for adding or editing bill definitions
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AMOUNT_TYPE,
  AMOUNT_TYPE_OPTIONS,
  BILL_CATEGORIES,
  FREQUENCY,
  FREQUENCY_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  currentMonthKey,
  formatMonthLabel,
  makeBillDefinition,
  upcomingDueMonths,
  validateBillDefinition,
} from '@expense/shared';
import { Modal } from './Modal.jsx';
import { Button, Field, MoneyInput, Segmented, Select, TextInput, Badge } from './ui.jsx';
import { Calendar, Info } from 'lucide-react';

export const blankBill = (anchorMonth = currentMonthKey()) => ({
  name: '',
  category: 'Housing',
  amountType: AMOUNT_TYPE.FIXED,
  amount: null,
  frequency: FREQUENCY.MONTHLY,
  intervalMonths: 1,
  dueDay: 5,
  anchorMonth,
  endMonth: null,
  paymentMode: 'scheduled',
  note: '',
  active: true,
});

export function BillFields({ draft, patch, errors = {}, currency }) {
  const isVariable = draft.amountType === AMOUNT_TYPE.VARIABLE;
  const isCustom = draft.frequency === FREQUENCY.CUSTOM;
  const isOneTime = draft.frequency === FREQUENCY.ONE_TIME;

  // Live preview of upcoming due months
  const preview = useMemo(() => {
    const def = makeBillDefinition({ ...draft, name: draft.name || 'Bill' });
    return upcomingDueMonths(def, def.anchorMonth, 4);
  }, [draft]);

  return (
    <div className="space-y-6">
      {/* Bill identity */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Bill Name" htmlFor="bill-name" error={errors.name} required>
          <TextInput
            id="bill-name"
            data-autofocus
            placeholder="Netflix, Rent, Electricity..."
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            error={errors.name}
            className="h-11 font-semibold"
          />
        </Field>
        <Field label="Category" htmlFor="bill-category">
          <Select
            id="bill-category"
            value={draft.category}
            onChange={(event) => patch({ category: event.target.value })}
            className="h-11"
          >
            {BILL_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </Select>
        </Field>
      </div>

      {/* Amount configuration */}
      <div className="space-y-4">
        <Field label="Amount Type">
          <Segmented
            options={AMOUNT_TYPE_OPTIONS}
            value={draft.amountType}
            variant="elevated"
            onChange={(amountType) => patch({ amountType })}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={isVariable ? 'Starting estimate (optional)' : 'Fixed amount per cycle'}
            htmlFor="bill-amount"
            error={errors.amount}
            required={!isVariable}
          >
            <MoneyInput
              id="bill-amount"
              currency={currency}
              value={draft.amount}
              onChange={(amount) => patch({ amount })}
              placeholder="0"
              error={errors.amount}
              className="h-11"
            />
            {isVariable && (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Info size={12} />
                Variable bills auto-learn from the average of your last 3 confirmations.
              </p>
            )}
          </Field>
          <Field label="Due Day of Month" htmlFor="bill-due" error={errors.dueDay}>
            <TextInput
              id="bill-due"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={draft.dueDay}
              onChange={(event) => patch({ dueDay: event.target.value })}
              error={errors.dueDay}
              className="h-11"
            />
          </Field>
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-4">
        <Field label="Recurrence Pattern">
          <Segmented
            cols={4}
            options={FREQUENCY_OPTIONS}
            value={draft.frequency}
            variant="elevated"
            onChange={(frequency) => {
              const option = FREQUENCY_OPTIONS.find((item) => item.id === frequency);
              patch({ frequency, intervalMonths: option?.intervalMonths ?? 1 });
            }}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          {isCustom && (
            <Field label="Repeat every (months)" htmlFor="bill-interval" error={errors.intervalMonths}>
              <TextInput
                id="bill-interval"
                type="number"
                min={1}
                max={36}
                inputMode="numeric"
                value={draft.intervalMonths}
                onChange={(event) => patch({ intervalMonths: event.target.value })}
                error={errors.intervalMonths}
                className="h-11"
              />
            </Field>
          )}

          <Field
            label={isOneTime ? 'Month it is due' : 'Starts from (Month)'}
            htmlFor="bill-anchor"
            error={errors.anchorMonth}
          >
            <TextInput
              id="bill-anchor"
              type="month"
              value={draft.anchorMonth || ''}
              onChange={(event) => patch({ anchorMonth: event.target.value })}
              error={errors.anchorMonth}
              className="h-11"
            />
          </Field>

          {!isOneTime && (
            <Field label="Ends on (Optional)" htmlFor="bill-end" error={errors.endMonth}>
              <TextInput
                id="bill-end"
                type="month"
                value={draft.endMonth || ''}
                onChange={(event) => patch({ endMonth: event.target.value || null })}
                error={errors.endMonth}
                hint="Leave empty for ongoing bills"
                className="h-11"
              />
            </Field>
          )}
        </div>
      </div>

      {/* Payment method */}
      <Field label="How it gets paid">
        <Segmented
          options={PAYMENT_MODE_OPTIONS}
          value={draft.paymentMode}
          variant="elevated"
          onChange={(paymentMode) => patch({ paymentMode })}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes (Optional)" htmlFor="bill-note">
        <TextInput
          id="bill-note"
          placeholder="Landlord name, account number, plan details..."
          value={draft.note}
          onChange={(event) => patch({ note: event.target.value })}
          className="h-10"
        />
      </Field>

      {/* Due date preview */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
        <Calendar size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-1">Upcoming in schedule</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.length > 0
              ? preview.map((key) => (
                <Badge key={key} variant="info" size="sm">
                  {formatMonthLabel(key)}
                </Badge>
              ))
              : <p className="text-xs text-slate-400 dark:text-slate-500">No upcoming months in range</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bill form wrapped in a modal dialog with validation on save. */
export function BillFormModal({ open, initial, onClose, onSave, currency, anchorMonth, busy = false }) {
  const [draft, setDraft] = useState(() => initial || blankBill(anchorMonth));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setDraft(initial || blankBill(anchorMonth));
      setErrors({});
    }
  }, [open, initial, anchorMonth]);

  const patch = (updates) => setDraft((prev) => ({ ...prev, ...updates }));

  function submit() {
    const candidate = makeBillDefinition(draft, []);
    const def = draft.id ? { ...candidate, id: draft.id } : candidate;
    const { ok, errors: found } = validateBillDefinition(def);
    if (!ok) {
      setErrors(found);
      return;
    }
    setErrors({});
    onSave({ ...draft, id: draft.id, amount: def.amount, dueDay: def.dueDay, intervalMonths: def.intervalMonths });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft.id ? 'Edit Bill Definition' : 'Create New Bill'}
      subtitle="Configure once, then let it manage itself month after month."
      size="lg"
      footer={(
        <>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>Discard</Button>
          <Button variant="primary" className="w-full sm:w-auto" onClick={submit} busy={busy}>
            {draft.id ? 'Save Changes' : 'Create Bill'}
          </Button>
        </>
      )}
    >
      <BillFields draft={draft} patch={patch} errors={errors} currency={currency} />
    </Modal>
  );
}
