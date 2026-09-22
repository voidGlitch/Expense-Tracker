import { ArrowDownLeft, ArrowUpRight, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import { Banner, Button } from '../components/ui.jsx';
import { formatMoney } from '../lib/money.js';

export default function SharedPosition({ shared, error, loading, refresh }) {
  const positions = shared?.openPositions || [];
  const currencies = [...new Set(positions.map((row) => row.currency))];
  return <section className="spending-shared" aria-labelledby="shared-position-title" aria-busy={loading}>
    <div className="position-heading">
      <span className="position-icon"><Users size={21} aria-hidden="true" /></span>
      <div><h2 id="shared-position-title">Shared expense position</h2><p>Open balances across all months. Settled balances are hidden.</p></div>
      <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refresh} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing' : 'Refresh'}</Button>
    </div>
    {error ? <Banner variant="warn">Unable to load shared expenses: {error}</Banner> : !shared ? <p role="status" className="position-message">Loading your shared balances…</p> : positions.length === 0 ?
      <div className="position-empty"><CheckCircle2 size={26} aria-hidden="true" /><div><h3>All settled up</h3><p>You have no outstanding shared balances. Your payment history stays in Entries.</p></div></div>
      : <>
        {currencies.map((currency) => <div key={currency} className="position-currency">
          <div className="position-totals">
            <div className="position-receivable"><span><ArrowDownLeft size={16} aria-hidden="true" /> You are owed · {currency}</span><strong>{formatMoney(positions.filter((row) => row.currency === currency && row.direction === 'receivable').reduce((sum, row) => sum + row.amount, 0), currency)}</strong></div>
            <div className="position-payable"><span><ArrowUpRight size={16} aria-hidden="true" /> You owe · {currency}</span><strong>{formatMoney(positions.filter((row) => row.currency === currency && row.direction === 'payable').reduce((sum, row) => sum + row.amount, 0), currency)}</strong></div>
          </div>
          <ul className="position-list">{positions.filter((row) => row.currency === currency).map((row) => <li key={row.id}>
            <div><h3>{row.personName}</h3><p>{row.contextTitle} · Open balance</p></div>
            <div className={`position-balance position-${row.direction}`}><span>{row.direction === 'receivable' ? 'Owes you' : 'You owe'}</span><strong>{formatMoney(row.amount, currency)}</strong></div>
          </li>)}</ul>
        </div>)}
        <p className="position-footnote">Each balance is shown once per person and ledger. Record a payment in Shared Expenses to settle it.</p>
      </>}
    <div className="position-guide"><strong>How it affects Spending</strong><p>Paying a shared bill records the full amount you paid. Money received back is a credit. If someone paid for you, your spending starts when you repay them.</p></div>
  </section>;
}
