
/**
 * Enhanced HistoryView: Past months overview, spending analysis charts, and Excel export
 * Includes modern charts, category breakdown, trends, and spending insights
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  History as HistoryIcon,
  BarChart2,
  PieChart,
  TrendingUp as TrendUp,
} from 'lucide-react';

import { formatMonthLabel, monthSummary } from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { api } from '../lib/api.js';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
} from '../components/ui.jsx';

import {
  SpendingTrendChart,
  CategoryBreakdownChart,
  WeeklySpendingChart,
  MonthComparisonChart,
  SpendingInsights,
} from '../components/SpendingChart.jsx';

export default function HistoryView() {
  const { store, money, months: allMonthIds } = useStore();

  const [selectedExportMonth, setSelectedExportMonth] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [availableExportMonths, setAvailableExportMonths] = useState([]);
  const [activeTab, setActiveTab] = useState('ledger');

  // Fetch exportable months list from server
  useEffect(() => {
    let active = true;

    api.exportMonths()
      .then((data) => {
        if (active && data?.months) {
          setAvailableExportMonths(data.months);
        }
      })
      .catch(() => {
        if (active) {
          setAvailableExportMonths(allMonthIds || []);
        }
      });

    return () => {
      active = false;
    };
  }, [allMonthIds]);

  const historyRows = useMemo(() => {
    if (!store?.months) return [];

    return store.months
      .map((m) => {
        const summary = monthSummary(m);

        return {
          id: m.id,
          status: m.status,
          income: summary.totalIncome,
          bills: summary.committedBills,
          discretionarySpent: summary.discretionarySpent,
          savings: summary.plannedSavings,
          result: m.closing ? m.closing.result : summary.remaining,
          transactionCount: summary.transactionCount,
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [store]);

  const sortedMonths = useMemo(() => {
    if (!store?.months) return [];

    return [...store.months]
      .filter((m) => m && m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [store]);

  const currentMonth = useMemo(() => {
    if (!store?.months) return null;

    const activeMonth = store.months.find(
      (m) => m.id === store.activeMonthId
    );

    return activeMonth || store.months[store.months.length - 1];
  }, [store]);

  async function handleExportExcel() {
    setDownloading(true);
    setExportError(null);

    try {
      const target =
        selectedExportMonth === 'all'
          ? 'all'
          : [selectedExportMonth];

      await api.downloadXlsx(target);
    } catch (err) {
      setExportError(
        err?.message || 'Failed to download Excel file.'
      );
    } finally {
      setDownloading(false);
    }
  }

  if (!store || !store.months || store.months.length === 0) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState
          icon={HistoryIcon}
          title="No history yet"
        >
          Once you start logging and closing months, your history and
          trends will appear here.
        </EmptyState>
      </Card>
    );
  }

  const tabs = [
    {
      id: 'ledger',
      label: 'Ledger',
      icon: HistoryIcon,
    },
    {
      id: 'charts',
      label: 'Analysis',
      icon: BarChart2,
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: PieChart,
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: TrendUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Ledger &amp; History
        </h1>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Review historical month-end balances, spending trends, and
          export reports
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="History sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Excel Export Card - Always visible */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center size-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet size={20} />
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Export to Excel (.xlsx)
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download spreadsheets containing transaction lists,
              bills, and calculated monthly figures
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div className="min-w-[14rem] flex-1">
            <label
              htmlFor="export-month-select"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Select Scope
            </label>

            <Select
              id="export-month-select"
              value={selectedExportMonth}
              onChange={(e) => setSelectedExportMonth(e.target.value)}
              className="h-10 bg-white dark:bg-slate-950"
              aria-label="Export month selection"
            >
              <option value="all">All recorded months</option>

              {availableExportMonths.map((m) => {
                const monthId =
                  typeof m === 'string' ? m : m?.id;

                if (!monthId) return null;

                const monthLabel =
                  typeof m === 'string'
                    ? formatMonthLabel(m)
                    : m.label || formatMonthLabel(m.id);

                return (
                  <option key={monthId} value={monthId}>
                    {monthLabel}
                  </option>
                );
              })}
            </Select>
          </div>

          <Button
            variant="primary"
            icon={Download}
            onClick={handleExportExcel}
            busy={downloading}
            className="h-10 px-5"
          >
            Download Excel
          </Button>
        </div>

        {exportError && (
          <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
            {exportError}
          </p>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'ledger' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* History Summary Table */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Monthly Ledger
              </h2>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {historyRows.length} recorded monthly cycles
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Month</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Income</th>
                  <th className="px-5 py-3.5 text-right">Bills</th>
                  <th className="px-5 py-3.5 text-right">Pool Spend</th>
                  <th className="px-5 py-3.5 text-right">Savings</th>
                  <th className="px-5 py-3.5 text-right">Net Balance</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {historyRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">
                      {formatMonthLabel(row.id)}
                    </td>

                    <td className="px-5 py-4">
                      <Badge
                        variant={
                          row.status === 'closed'
                            ? 'neutral'
                            : 'success'
                        }
                        size="sm"
                      >
                        {row.status}
                      </Badge>
                    </td>

                    <td className="px-5 py-4 text-right tnum font-medium text-slate-700 dark:text-slate-300">
                      {money(row.income)}
                    </td>

                    <td className="px-5 py-4 text-right tnum font-medium text-slate-700 dark:text-slate-300">
                      {money(row.bills)}
                    </td>

                    <td className="px-5 py-4 text-right tnum font-medium text-slate-700 dark:text-slate-300">
                      {money(row.discretionarySpent)}
                    </td>

                    <td className="px-5 py-4 text-right tnum font-medium text-slate-700 dark:text-slate-300">
                      {money(row.savings)}
                    </td>

                    <td
                      className={`px-5 py-4 text-right tnum font-bold ${
                        row.result < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {money(row.result)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="space-y-6">
          {/* Spending Insights */}
          <SpendingInsights
            month={currentMonth}
            previousMonths={sortedMonths.slice(0, -1)}
            money={money}
          />

          {/* Spending Trend Chart */}
          <SpendingTrendChart
            months={sortedMonths}
            money={money}
          />

          {/* Month-over-Month Comparison */}
          <MonthComparisonChart
            months={sortedMonths}
            money={money}
          />
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-6">
          {/* Category Breakdown Chart */}
          <CategoryBreakdownChart
            month={currentMonth}
            money={money}
          />

          {/* Weekly Spending Chart */}
          <WeeklySpendingChart
            month={currentMonth}
            money={money}
          />
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="space-y-6">
          {/* Monthly Spending Trend */}
          <SpendingTrendChart
            months={sortedMonths}
            money={money}
          />

          {/* Category Breakdown for Current Month */}
          <CategoryBreakdownChart
            month={currentMonth}
            money={money}
          />

          {/* Weekly Spending for Current Month */}
          <WeeklySpendingChart
            month={currentMonth}
            money={money}
          />
        </div>
      )}
    </div>
  );
}