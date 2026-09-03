/**
 * Enhanced Charts: Modern, clean data visualizations with dark/light theme support
 * Uses the design system colors and smooth animations
 */
import { useMemo } from 'react';
import {
  ArcElement, CategoryScale, Chart, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { formatCompact, formatMoney } from '../lib/money.js';

Chart.register(ArcElement, CategoryScale, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip);

// Design system color palette for charts
const CHART_PALETTE = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
];

const getThemeColors = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    isDark,
    grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)',
    text: isDark ? '#94a3b8' : '#64748b',
    textStrong: isDark ? '#cbd5e1' : '#334155',
    cardBg: isDark ? '#1e293b' : '#ffffff',
    hoverBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  };
};

/** Category breakdown doughnut chart - modern with soft colors and hover effects */
export function CategoryDoughnut({ breakdown, currency, className = '' }) {
  const theme = getThemeColors();

  const data = useMemo(() => ({
    labels: breakdown.map((slice) => slice.category),
    datasets: [{
      data: breakdown.map((slice) => slice.amount),
      backgroundColor: breakdown.map((slice) => slice.color),
      borderWidth: 0,
      hoverOffset: 8,
      borderAlign: 'center',
    }],
  }), [breakdown]);

  const options = useMemo(() => ({
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.cardBg,
        titleColor: theme.textStrong,
        bodyColor: theme.textStrong,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        displayColors: false,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 13 },
        callbacks: {
          label: (item) => ` ${item.label}: ${formatMoney(item.parsed, currency)} (${item.chart.data.labels.filter((l, i) => i === item.dataIndex).length ? '100' : Math.round((item.parsed / item.chart.data.datasets[0].data.reduce((a, b) => a + b, 0)) * 100)}%)`,
        },
      },
    },
    maintainAspectRatio: false,
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 800,
      easing: 'easeOutCubic',
    },
  }), [currency, theme]);

  return <div className={className}><Doughnut data={data} options={options} /></div>;
}

/** Spending pace chart - clean line chart with gradient fill and clear axis */
export function PaceChart({ series, currency, className = '' }) {
  const theme = getThemeColors();
  const primaryColor = '#0ea5e9';
  const secondaryColor = '#94a3b8';

  const data = useMemo(() => ({
    labels: series.map((point) => point.day),
    datasets: [
      {
        label: 'Cumulative Spent',
        data: series.map((point) => point.cumulative),
        borderColor: primaryColor,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, `${primaryColor}22`);
          gradient.addColorStop(1, `${primaryColor}00`);
          return gradient;
        },
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: primaryColor,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        borderWidth: 2.5,
      },
      {
        label: 'Ideal Pace',
        data: series.map((point) => point.budgetLine),
        borderColor: secondaryColor,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ],
  }), [series]);

  const options = useMemo(() => ({
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'start',
        labels: {
          color: theme.text,
          boxWidth: 14,
          boxHeight: 3,
          borderRadius: 2,
          font: { size: 11, weight: '500' },
          padding: 16,
          usePointStyle: true,
          pointStyle: 'rectRounded',
        },
      },
      tooltip: {
        backgroundColor: theme.cardBg,
        titleColor: theme.textStrong,
        bodyColor: theme.textStrong,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 14,
        cornerRadius: 12,
        displayColors: true,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 13 },
        callbacks: {
          label: (item) => ` ${item.dataset.label}: ${formatMoney(item.parsed.y, currency)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: theme.text,
          maxTicksLimit: 8,
          font: { size: 10, weight: '500' },
          padding: 8,
        },
      },
      y: {
        grid: { color: theme.grid, drawBorder: false },
        border: { display: false },
        ticks: {
          color: theme.text,
          font: { size: 10 },
          padding: 10,
          callback: (value) => formatCompact(value, currency),
        },
      },
    },
    animation: {
      duration: 750,
      easing: 'easeOutQuart',
    },
  }), [currency, theme]);

  return <div className={className}><Line data={data} options={options} /></div>;
}