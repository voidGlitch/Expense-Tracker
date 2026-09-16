/**
 * Spending Analysis Charts Component
 * Uses Chart.js for visualizing spending patterns, trends, and category breakdowns
 */
import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatMonthLabel } from '@expense/shared';
import {
  categorySpending,
  spendingTrends,
  categoryDistribution,
  weeklySpending,
  topCategories
} from '@expense/shared/engine';
import { Card, Stat } from './ui.jsx';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Color palette for charts
const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#64748b', // slate
];

/**
 * Spending Trend Line Chart
 * Shows spending over time across multiple months
 */
export function SpendingTrendChart({ months, money, className = '' }) {
  const chartData = useMemo(() => {
    if (!months || months.length === 0) return null;

    const trends = spendingTrends(months);
    const labels = trends.map(t => formatMonthLabel(t.monthId));
    const data = trends.map(t => t.total);

    return {
      labels,
      datasets: [{
        label: 'Monthly Spending',
        data,
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: '#3b82f6',
        borderWidth: 2,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    };
  }, [months]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Monthly Spending Trend',
        font: {
          size: 14,
          weight: '600'
        },
        color: '#1e293b',
        padding: { bottom: 16 }
      },
      tooltip: {
        callbacks: {
          label: (context) => `Spending: ₹${context.parsed.y.toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)'
        },
        ticks: {
          callback: (value) => `₹${(value / 1000).toFixed(0)}k`,
          color: '#64748b'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#64748b'
        }
      }
    }
  }), []);

  if (!chartData) return null;

  return (
    <Card variant="subtle" className={`p-6 ${className}`}>
      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </Card>
  );
}

/**
 * Category Breakdown Doughnut Chart
 * Shows percentage distribution of spending by category
 */
export function CategoryBreakdownChart({ month, money, className = '' }) {
  const chartData = useMemo(() => {
    if (!month) return null;

    const top = topCategories(month, 6);
    if (top.length === 0) return null;

    const labels = top.map(c => c.category);
    const data = top.map(c => c.amount);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, top.length),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverBorderWidth: 3,
        hoverOffset: 8
      }]
    };
  }, [month]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 12 }
        }
      },
      title: {
        display: true,
        text: 'Spending by Category',
        font: {
          size: 14,
          weight: '600'
        },
        color: '#1e293b',
        padding: { bottom: 8 }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((context.raw / total) * 100).toFixed(1);
            return `${context.label}: ₹${context.raw.toLocaleString('en-IN')} (${percentage}%)`;
          }
        }
      }
    }
  }), []);

  if (!chartData) return null;

  return (
    <Card variant="subtle" className={`p-6 ${className}`}>
      <div className="h-72">
        <Doughnut data={chartData} options={options} />
      </div>
    </Card>
  );
}

/**
 * Weekly Spending Bar Chart
 * Shows spending breakdown by week within a month
 */
export function WeeklySpendingChart({ month, money, className = '' }) {
  const chartData = useMemo(() => {
    if (!month) return null;

    const weeklyData = weeklySpending(month);
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    const amounts = [
      weeklyData.week1 || 0,
      weeklyData.week2 || 0,
      weeklyData.week3 || 0,
      weeklyData.week4 || 0,
      weeklyData.week5 || 0
    ];
    // Never reference the array while it is being initialized (which used to
    // throw on the Categories and Trends tabs). Week five is optional only.
    const data = amounts.filter((amount, index) => index < 4 || amount > 0);

    return {
      labels: labels.slice(0, data.length),
      datasets: [{
        label: 'Weekly Spending',
        data,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: '#10b981',
        borderWidth: 2,
        borderRadius: 8,
        hoverBackgroundColor: 'rgba(16, 185, 129, 0.9)'
      }]
    };
  }, [month]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Weekly Spending Breakdown',
        font: {
          size: 14,
          weight: '600'
        },
        color: '#1e293b',
        padding: { bottom: 16 }
      },
      tooltip: {
        callbacks: {
          label: (context) => `Spent: ₹${context.parsed.y.toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)'
        },
        ticks: {
          callback: (value) => `₹${(value / 1000).toFixed(0)}k`,
          color: '#64748b'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#64748b'
        }
      }
    }
  }), []);

  if (!chartData) return null;

  return (
    <Card variant="subtle" className={`p-6 ${className}`}>
      <div className="h-64">
        <Bar data={chartData} options={options} />
      </div>
    </Card>
  );
}

/**
 * Month-over-Month Comparison Bar Chart
 * Compare spending across multiple months
 */
export function MonthComparisonChart({ months, money, className = '' }) {
  const chartData = useMemo(() => {
    if (!months || months.length < 2) return null;

    const trends = spendingTrends(months);
    const labels = trends.map(t => formatMonthLabel(t.monthId));
    const data = trends.map(t => t.total);

    // Calculate average
    const avg = data.reduce((sum, val) => sum + val, 0) / data.length;

    return {
      labels,
      datasets: [
        {
          label: 'Spending',
          data,
          backgroundColor: trends.map(t =>
            t.total > avg ? 'rgba(239, 68, 68, 0.7)' : 'rgba(16, 185, 129, 0.7)'
          ),
          borderColor: trends.map(t =>
            t.total > avg ? '#ef4444' : '#10b981'
          ),
          borderWidth: 2,
          borderRadius: 6
        },
        {
          label: 'Average',
          data: Array(data.length).fill(avg),
          type: 'line',
          borderColor: '#64748b',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [months]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          padding: 16,
          usePointStyle: true,
          font: { size: 12 }
        }
      },
      title: {
        display: true,
        text: 'Month-over-Month Comparison',
        font: {
          size: 14,
          weight: '600'
        },
        color: '#1e293b',
        padding: { bottom: 16 }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (context.dataset.label === 'Average') {
              return `Average: ₹${context.parsed.y.toLocaleString('en-IN')}`;
            }
            return `Spending: ₹${context.parsed.y.toLocaleString('en-IN')}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)'
        },
        ticks: {
          callback: (value) => `₹${(value / 1000).toFixed(0)}k`,
          color: '#64748b'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#64748b'
        }
      }
    }
  }), []);

  if (!chartData) return null;

  return (
    <Card variant="subtle" className={`p-6 ${className}`}>
      <div className="h-64">
        <Bar data={chartData} options={options} />
      </div>
    </Card>
  );
}

/**
 * Spending Insights Summary
 * Textual summary of spending patterns and anomalies
 */
export function SpendingInsights({ month, previousMonths = [], money }) {
  const insights = useMemo(() => {
    if (!month) return [];

    const textInsights = [];

    // Top categories
    const top = topCategories(month, 3);
    if (top.length > 0) {
      textInsights.push({
        type: 'info',
        text: `Top spending: ${top.map(c => `${c.category} (${c.percentage}%)`).join(', ')}`
      });
    }

    // Comparison with previous month
    if (previousMonths.length > 0) {
      const lastMonth = previousMonths[previousMonths.length - 1];
      const currentTotal = Object.values(categorySpending(month)).reduce((sum, val) => sum + val, 0);
      const lastTotal = Object.values(categorySpending(lastMonth)).reduce((sum, val) => sum + val, 0);

      if (currentTotal > lastTotal) {
        const increase = currentTotal - lastTotal;
        const percent = Math.round((increase / lastTotal) * 100);
        textInsights.push({
          type: 'warning',
          text: `Spending increased by ${percent}% (₹${increase.toLocaleString('en-IN')}) compared to last month`
        });
      } else if (currentTotal < lastTotal) {
        const decrease = lastTotal - currentTotal;
        const percent = Math.round((decrease / lastTotal) * 100);
        textInsights.push({
          type: 'success',
          text: `Spending decreased by ${percent}% (₹${decrease.toLocaleString('en-IN')}) compared to last month - great job!`
        });
      }
    }

    return textInsights;
  }, [month, previousMonths]);

  if (insights.length === 0) return null;

  return (
    <Card variant="subtle" className="p-6">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Spending Insights</h3>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm ${
              insight.type === 'warning'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                : insight.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
            }`}
          >
            {insight.text}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Export all chart components
 */
export default {
  SpendingTrendChart,
  CategoryBreakdownChart,
  WeeklySpendingChart,
  MonthComparisonChart,
  SpendingInsights
};
