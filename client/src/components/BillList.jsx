/**
 * Enhanced BillList: Interactive list of bills due in the current month
 */
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, Check, Pencil, Info, AlertTriangle } from 'lucide-react';
import { BILL_STATUS, formatDayLabel } from '@expense/shared';
import { Modal } from './Modal.jsx';
import { Badge, Button, EmptyState, Field, MoneyInput } from './ui.jsx';

const SOURCE_HINT = {
  average: 'learned average from the past 3 months',
  definition: 'from your bill definition settings',
  fallback: 'most recently confirmed amount',
  legacy: 'carried over from an earlier backup',
  none: 'not yet estimated',
};

/** Rank: what needs the user first comes first. */
const rank = (bill) => {
  if (bill.status === BILL_STATUS.PENDING && bill.needsInput) return 0;
  if (bill.status === BILL_STATUS.PENDING) return 1;
  return 2;
};

function ConfirmBillModal({ bill, open, onClose, onSave, currency }) {
  const [amount, setAmount] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && bill) {
      setAmount(bill.actualAmount ?? bill.provisionalAmount ?? null);
      setError(null);
    }
  }, [open, bill]);

  if (!bill) return null;

  const save = () => {
    if (!(Number(amount) >= 0)) {
      setError('Enter the amount actually charged.');
      return;
    }
    onSave(bill.id, Number(amount));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bill.name}
      subtitle={`Confirm payment for ${formatDayLabel(bill.dueDate)}`}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button variant="primary" onClick={save} className="w-full sm:w-auto">Confirm & Save</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center size-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
              <CalendarClock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{bill.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{formatDayLabel(bill.dueDate)}</p>
            </div>
          </div>
        </div>

        <Field
          label="Final charged amount"
          htmlFor="bill-actual"
          error={error}
          hint={bill.estimateSource ? `Currently estimated as ${SOURCE_HINT[bill.estimateSource]}` : undefined}
        >
          <MoneyInput
            id="bill-actual"
            data-autofocus
            currency={currency}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            error={error}
            className="h-12 text-lg font-bold"
          />
        </Field>
      </div>
    </Modal>
  );
}

export function BillList({ bills, currency, money, onConfirm, onUnconfirm, readOnly = false, emptyHint }) {
  const [confirming, setConfirming] = useState(null);
  const ordered = [...bills].sort((a, b) => rank(a) - rank(b) || String(a.dueDate).localeCompare(String(b.dueDate)));

  if (ordered.length === 0) {
    return (
      <EmptyState icon={CalendarClock} title="No bills this month">
        {emptyHint || 'Once defined, your bills will automatically appear here on their due months.'}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {ordered.map((bill) => {
          const pending = bill.status === BILL_STATUS.PENDING;
          const amount = pending ? bill.provisionalAmount : bill.actualAmount;
          const needsInput = bill.needsInput;

          return (
            <div
              key={bill.id}
              className={`flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/20 ${
                needsInput ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`flex items-center justify-center size-10 rounded-xl flex-shrink-0 ${
                  pending
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {pending ? <AlertCircle size={18} /> : <Check size={18} />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {bill.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatDayLabel(bill.dueDate)}</span>
                    {bill.paymentMode === 'postpaid' && <Badge variant="warning" size="sm">Postpaid</Badge>}
                    {bill.amountType === 'variable' && <Badge variant="accent" size="sm">Variable</Badge>}
                    {needsInput && <Badge variant="error" size="sm">Needs Amount</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={`tnum text-base font-bold ${pending ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {bill.needsInput && !amount ? '—' : `${pending ? '~' : ''}${money(amount || 0)}`}
                  </p>
                  {pending && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      estimated
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-1">
                    {pending ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setConfirming(bill)}
                        className="h-9 px-4 shadow-sm shadow-primary-500/20"
                      >
                        Confirm
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          onClick={() => setConfirming(bill)}
                          aria-label={`Edit ${bill.name} amount`}
                          className="h-9 px-2"
                        >Edit</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUnconfirm(bill.id)}
                          className="text-xs h-9"
                        >
                          Undo
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmBillModal
        bill={confirming}
        open={Boolean(confirming)}
        currency={currency}
        onClose={() => setConfirming(null)}
        onSave={onConfirm}
      />
    </>
  );
}
