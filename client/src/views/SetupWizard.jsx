/**
 * Enhanced SetupWizard: Stepper design, live interactive preview,
 * friendly onboarding flow
 */
import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, PiggyBank, Plus, ReceiptText, Sparkles, Trash2, Wallet,
  Calendar, Layers, Shield
} from 'lucide-react';
import {
  CURRENCIES,
  applySetup,
  currentMonthKey,
  emptyStore,
  formatMonthLabel,
  getMonth,
  monthSummary,
} from '@expense/shared';
import { useAuth } from '../state/AuthContext.jsx';
import { useStore } from '../state/StoreContext.jsx';
import { BillFormModal } from '../components/BillForm.jsx';
import {
  Badge, Banner, Button, Card, Field, MoneyInput, Select, TextInput,
} from '../components/ui.jsx';

const STEPS = [
  { id: 'income', title: 'Income & Baseline', icon: Wallet, desc: 'Your recurring pay and pay schedule' },
  { id: 'bills', title: 'Recurring Bills', icon: ReceiptText, desc: 'Fixed and variable commitments' },
  { id: 'savings', title: 'Savings Targets', icon: PiggyBank, desc: 'RD, emergency, and debt recovery' },
];

const FREQUENCY_LABEL = {
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  custom: 'Custom interval',
  oneTime: 'One time',
};

export default function SetupWizard() {
  const { user, signOut } = useAuth();
  const { apply, save } = useStore();
  const monthId = currentMonthKey();

  const [step, setStep] = useState(0);
  const [income, setIncome] = useState(null);
  const [extraIncome, setExtraIncome] = useState(null);
  const [currency, setCurrency] = useState('INR');
  const [salaryDay, setSalaryDay] = useState(1);
  const [bills, setBills] = useState([]);
  const [rd, setRd] = useState({ installment: null, tenureMonths: 12, estAnnualRate: 6.5 });
  const [savingsTarget, setSavingsTarget] = useState(null);
  const [recovery, setRecovery] = useState({ targetDeficit: null, months: 3 });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const setup = useMemo(() => ({
    monthId,
    settings: { currency, salaryDay: Number(salaryDay) || 1 },
    billDefinitions: bills,
    income: income || 0,
    extraIncome: extraIncome || 0,
    savingsTarget: savingsTarget || 0,
    rd: { ...rd, installment: rd.installment || 0, startMonth: monthId },
    recovery: recovery.targetDeficit ? recovery : null,
  }), [monthId, currency, salaryDay, bills, income, extraIncome, savingsTarget, rd, recovery]);

  const preview = useMemo(() => {
    try {
      const store = applySetup(emptyStore(), setup);
      const month = getMonth(store, monthId);
      return month ? monthSummary(month) : null;
    } catch {
      return null;
    }
  }, [setup, monthId]);

  const canAdvance = step !== 0 || Number(income) > 0;

  function saveBill(draft) {
    setBills((prev) => {
      if (editing?.index >= 0) return prev.map((bill, index) => (index === editing.index ? draft : bill));
      return [...prev, draft];
    });
    setEditing(null);
  }

  function finish() {
    setError(null);
    try {
      apply((store) => applySetup(store, setup));
    } catch (caught) {
      setError(caught.message);
    }
  }

  const money = (value) => new Intl.NumberFormat(CURRENCIES[currency].locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
  }).format(Number(value) || 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 sm:p-8">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
            <PiggyBank size={20} aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">First-Time Setup</span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {user?.name ? `Welcome, ${user.name}` : 'Welcome'}
            </h1>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
      </header>

      {/* Stepper */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {STEPS.map((item, index) => {
          const isActive = index === step;
          const isDone = index < step;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                isActive ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''
              }`}
            >
              <div
                className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold transition-all ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                }`}
              >
                {isDone ? <Check size={16} /> : index + 1}
              </div>
              <div className="hidden sm:block min-w-0">
                <p className={`text-xs font-bold truncate ${isActive ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-400'}`}>
                  {item.title}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 0: Income */}
      {step === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Monthly Net Income</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your predictable take-home salary or regular earnings. You can adjust this for individual months later.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Monthly Base Salary / Income" htmlFor="income" required>
              <MoneyInput id="income" data-autofocus currency={currency} value={income} onChange={setIncome} placeholder="50000" className="h-11" />
            </Field>
            <Field label="Extra Income for Initial Month" htmlFor="extra" hint="Bonus, freelance, cashback — optional.">
              <MoneyInput id="extra" currency={currency} value={extraIncome} onChange={setExtraIncome} placeholder="0" className="h-11" />
            </Field>
            <Field label="Base Currency" htmlFor="currency">
              <Select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-11 bg-white dark:bg-slate-950">
                {Object.keys(CURRENCIES).map((code) => (
                  <option key={code} value={code}>{code} — {CURRENCIES[code].symbol} ({CURRENCIES[code].name})</option>
                ))}
              </Select>
            </Field>
            <Field label="Salary Arrival Day" htmlFor="salaryDay" hint="Date your income lands (1–28).">
              <TextInput
                id="salaryDay"
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                value={salaryDay}
                onChange={(event) => setSalaryDay(event.target.value)}
                className="h-11"
              />
            </Field>
          </div>

          {income != null && income <= 0 && (
            <Banner variant="warn">Please enter an income greater than zero to initialize your daily allowance calculation.</Banner>
          )}
        </div>
      )}

      {/* Step 1: Bills */}
      {step === 1 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Recurring Monthly Bills</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Add fixed commitments like rent, internet, subscriptions, and EMIs. They'll automatically populate every month.
              </p>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing({ index: -1, draft: null })}>
              Add Bill
            </Button>
          </div>

          {bills.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No bills added yet. You can add them now or later in the Bills tab. Adding them now helps configure your accurate daily spending allowance!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              {bills.map((bill, index) => (
                <div key={`${bill.name}-${index}`} className="flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{bill.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>{bill.category}</span>
                      <span>•</span>
                      <span>{FREQUENCY_LABEL[bill.frequency] || bill.frequency}</span>
                      <span>•</span>
                      <span>Due day {bill.dueDay}</span>
                      {bill.paymentMode === 'postpaid' && <Badge variant="warning" size="sm">Postpaid</Badge>}
                      {bill.amountType === 'variable' && <Badge variant="accent" size="sm">Variable</Badge>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-sm font-bold text-slate-900 dark:text-slate-100">
                      {bill.amount ? money(bill.amount) : '—'}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ index, draft: bill })}>Edit</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label={`Remove ${bill.name}`}
                      onClick={() => setBills((prev) => prev.filter((_, i) => i !== index))}
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Savings & RD */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Recurring Deposit (RD)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Automated recurring deposit commitment. Deducted straight from income before calculating spending pool.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monthly Installment" htmlFor="rd-amount">
                <MoneyInput
                  id="rd-amount"
                  currency={currency}
                  value={rd.installment}
                  onChange={(installment) => setRd((prev) => ({ ...prev, installment }))}
                  placeholder="0"
                  className="h-11"
                />
              </Field>
              <Field label="Tenure (Months)" htmlFor="rd-tenure">
                <TextInput
                  id="rd-tenure"
                  type="number"
                  min={1}
                  max={120}
                  inputMode="numeric"
                  value={rd.tenureMonths}
                  onChange={(event) => setRd((prev) => ({ ...prev, tenureMonths: event.target.value }))}
                  className="h-11"
                />
              </Field>
              <Field label="Annual Interest Rate (%)" htmlFor="rd-rate" hint="Expected return">
                <TextInput
                  id="rd-rate"
                  type="number"
                  step="0.1"
                  min={0}
                  max={20}
                  inputMode="decimal"
                  value={rd.estAnnualRate}
                  onChange={(event) => setRd((prev) => ({ ...prev, estAnnualRate: event.target.value }))}
                  className="h-11"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Target Savings & Recovery</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Goal-oriented surplus targets and optional overspend recovery schedules.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monthly Savings Target" htmlFor="savings-target">
                <MoneyInput id="savings-target" currency={currency} value={savingsTarget} onChange={setSavingsTarget} placeholder="0" className="h-11" />
              </Field>
              <Field label="Existing Deficit to Recover" htmlFor="recovery-amount" hint="Past overspend to pay off">
                <MoneyInput
                  id="recovery-amount"
                  currency={currency}
                  value={recovery.targetDeficit}
                  onChange={(targetDeficit) => setRecovery((prev) => ({ ...prev, targetDeficit }))}
                  placeholder="0"
                  className="h-11"
                />
              </Field>
              <Field label="Recovery Months" htmlFor="recovery-months">
                <TextInput
                  id="recovery-months"
                  type="number"
                  min={1}
                  max={24}
                  inputMode="numeric"
                  value={recovery.months}
                  onChange={(event) => setRecovery((prev) => ({ ...prev, months: event.target.value }))}
                  className="h-11"
                />
              </Field>
            </div>
          </div>

          {preview && (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/60 dark:border-indigo-800/40 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {formatMonthLabel(monthId)} Calculated Preview
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Monthly Income', money(preview.totalIncome)],
                  ['Total Commitments', money(preview.commitments)],
                  ['Discretionary Pool', money(preview.pool)],
                  ['Daily Safe Pace', money(preview.staticAllowance)],
                ].map(([label, value]) => (
                  <div key={label} className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="tnum mt-1 text-base font-bold text-slate-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>
              {preview.pool < 0 && (
                <Banner variant="warn">
                  Notice: Your fixed commitments and savings exceed total income. You can still proceed, and Expense Manager will help you balance it over time.
                </Banner>
              )}
            </div>
          )}
        </div>
      )}

      {error && <Banner variant="error" title="Setup could not be saved">{error}</Banner>}

      {/* Navigation Footer */}
      <footer className="mt-auto flex items-center justify-between gap-4 pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => setStep((prev) => Math.max(0, prev - 1))}
          disabled={step === 0}
        >
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((prev) => prev + 1)} disabled={!canAdvance} className="px-6">
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="primary" icon={Check} onClick={finish} busy={save.status === 'saving'} className="px-6 shadow-lg shadow-indigo-500/25">
            Complete Setup & Launch
          </Button>
        )}
      </footer>

      <BillFormModal
        open={Boolean(editing)}
        initial={editing?.draft || null}
        anchorMonth={monthId}
        currency={currency}
        onClose={() => setEditing(null)}
        onSave={saveBill}
      />
    </div>
  );
}
