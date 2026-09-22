import { budgetBreakdown } from '@expense/shared';

export function BudgetBreakdown({ month, summary, money, repaymentCredits = 0, repaymentDebits = 0 }) {
  const rows = budgetBreakdown(month);
  const spendingRows = [...rows.spending];
  if (repaymentCredits) spendingRows.push({ label: 'Repayments received (credit)', amount: -repaymentCredits });
  const sections = [
    { title: 'Total commitments', amount: summary.commitments, rows: rows.commitments,
      explanation: 'Money reserved for bills, recurring deposits, deficit recovery and savings. Confirmed bills use the amount paid; pending bills use their estimate.' },
    { title: 'Discretionary pool', amount: summary.pool, rows: rows.pool,
      explanation: 'Your income after commitments. This is the amount available for day-to-day spending.' },
    { title: 'Discretionary spent', amount: summary.discretionarySpent, rows: spendingRows,
      explanation: 'Day-to-day expenses, shared bills you paid, and repayments you sent. Received repayments reduce spending as credits. Unpaid amounts you owe are shown in Shared expense position.' },
  ];
  return <section aria-label="Budget breakdown" className="space-y-3">
    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">How your budget is calculated</h2>
    <div className="grid items-stretch gap-3 lg:grid-cols-3">
      {sections.map((section) => <details key={section.title} className="h-full rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
          {section.title}<span className="mt-2 block text-xl font-bold text-slate-900 dark:text-slate-100">{money(section.amount)}</span>
          <span className="mt-1 block text-xs font-normal text-indigo-600 dark:text-indigo-300">View breakdown</span>
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{section.explanation}</p>
        <dl className="mt-3 space-y-2 text-sm">
          {section.rows.map((row, index) => <div key={`${row.label}-${index}`} className="flex justify-between gap-4">
            <dt className="min-w-0 break-words">{row.label}{row.detail && <span className="block text-xs text-slate-500">{row.detail}</span>}</dt>
            <dd className="shrink-0 font-medium tnum">{money(row.amount)}</dd>
          </div>)}
          {!section.rows.length && <p className="text-slate-500">No discretionary expenses recorded.</p>}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 font-bold dark:border-slate-700"><dt>Total</dt><dd className="tnum">{money(section.amount)}</dd></div>
        </dl>
      </details>)}
    </div>
    <p className="text-sm text-slate-600 dark:text-slate-300">Remaining: {money(summary.pool)} − {money(summary.discretionarySpent)} = <strong>{money(summary.remaining)}</strong></p>
  </section>;
}
