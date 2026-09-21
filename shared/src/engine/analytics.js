/**
 * Spending Analytics Engine
 * Pure functions for analyzing spending patterns and trends
 * Part of SRS §11 - Core Algorithms
 */

/**
 * Calculate spending by category for a given month
 * @param {Object} month - Month record with transactions
 * @returns {Object} Category totals { categoryName: amount }
 */
export function categorySpending(month) {
  if (!month?.transactions) return {};

  const categories = {};

  for (const txn of [...month.transactions, ...(month.sharedTransactions || [])]) {
    if (txn.type !== 'expense') continue;
    const category = txn.category || 'Uncategorized';
    categories[category] = (categories[category] || 0) + (txn.amount || 0);
  }

  return categories;
}

/**
 * Calculate spending trends across multiple months
 * @param {Array} months - Array of month records
 * @param {string} categoryFilter - Optional category to filter by
 * @returns {Array} Monthly spending data [{ monthId, total, category: amount }]
 */
export function spendingTrends(months, categoryFilter = null) {
  if (!Array.isArray(months)) return [];

  return months
    .filter(m => m && m.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => {
      const categories = categorySpending(m);
      const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

      return {
        monthId: m.id,
        total,
        categories,
        ...(categoryFilter && { filtered: categories[categoryFilter] || 0 })
      };
    });
}

/**
 * Calculate percentage distribution of spending by category
 * @param {Object} month - Month record
 * @returns {Object} Category percentages { categoryName: percentage }
 */
export function categoryDistribution(month) {
  const categories = categorySpending(month);
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

  if (total === 0) return {};

  const distribution = {};
  for (const [category, amount] of Object.entries(categories)) {
    distribution[category] = Math.round((amount / total) * 100);
  }

  return distribution;
}

/**
 * Break down spending by week within a month
 * @param {Object} month - Month record
 * @returns {Object} Weekly totals { week1: amount, week2: amount, ... }
 */
export function weeklySpending(month) {
  if (!month?.transactions) return {};

  const weeks = { week1: 0, week2: 0, week3: 0, week4: 0, week5: 0 };

  for (const txn of [...month.transactions, ...(month.sharedTransactions || [])]) {
    if (txn.type !== 'expense' || !txn.date) continue;

    const day = parseInt(txn.date.split('-')[2], 10);
    const weekNum = Math.ceil(day / 7);
    const weekKey = `week${Math.min(weekNum, 5)}`;

    weeks[weekKey] = (weeks[weekKey] || 0) + (txn.amount || 0);
  }

  return weeks;
}

/**
 * Compare spending between two months
 * @param {Object} currentMonth - Current month record
 * @param {Object} previousMonth - Previous month record
 * @returns {Object} Comparison metrics
 */
export function comparisonMetrics(currentMonth, previousMonth) {
  const currentCats = categorySpending(currentMonth);
  const previousCats = categorySpending(previousMonth);

  const allCategories = new Set([
    ...Object.keys(currentCats),
    ...Object.keys(previousCats)
  ]);

  const increased = [];
  const decreased = [];
  const unchanged = [];
  const newCategories = [];
  const removedCategories = [];

  for (const category of allCategories) {
    const current = currentCats[category] || 0;
    const previous = previousCats[category] || 0;

    if (previous === 0 && current > 0) {
      newCategories.push({ category, amount: current });
    } else if (current === 0 && previous > 0) {
      removedCategories.push({ category, amount: previous });
    } else {
      const change = current - previous;
      const percentChange = previous > 0 ? Math.round((change / previous) * 100) : 0;

      if (change > 0) {
        increased.push({ category, change, percentChange, current, previous });
      } else if (change < 0) {
        decreased.push({ category, change: Math.abs(change), percentChange, current, previous });
      } else {
        unchanged.push({ category, amount: current });
      }
    }
  }

  return {
    increased: increased.sort((a, b) => b.change - a.change),
    decreased: decreased.sort((a, b) => b.change - a.change),
    unchanged,
    newCategories,
    removedCategories,
    totalCurrent: Object.values(currentCats).reduce((sum, val) => sum + val, 0),
    totalPrevious: Object.values(previousCats).reduce((sum, val) => sum + val, 0)
  };
}

/**
 * Get top spending categories
 * @param {Object} month - Month record
 * @param {number} limit - Number of top categories to return
 * @returns {Array} Top categories [{ category, amount, percentage }]
 */
export function topCategories(month, limit = 5) {
  const categories = categorySpending(month);
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

  return Object.entries(categories)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/**
 * Calculate daily spending average for a month
 * @param {Object} month - Month record
 * @returns {Object} Daily averages { overall, byCategory }
 */
export function dailySpendingAverage(month) {
  if (!month?.transactions || !month?.id) {
    return { overall: 0, byCategory: {} };
  }

  const year = parseInt(month.id.split('-')[0], 10);
  const monthNum = parseInt(month.id.split('-')[1], 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const categories = categorySpending(month);
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

  const byCategory = {};
  for (const [category, amount] of Object.entries(categories)) {
    byCategory[category] = Math.round(amount / daysInMonth);
  }

  return {
    overall: Math.round(total / daysInMonth),
    byCategory
  };
}

/**
 * Identify spending anomalies (unusually high/low spending)
 * @param {Array} months - Array of month records
 * @param {number} threshold - Standard deviation threshold
 * @returns {Object} Anomalies { highSpending: [], lowSpending: [] }
 */
export function identifyAnomalies(months, threshold = 1.5) {
  const trends = spendingTrends(months);
  if (trends.length < 3) return { highSpending: [], lowSpending: [] };

  const totals = trends.map(t => t.total);
  const mean = totals.reduce((sum, val) => sum + val, 0) / totals.length;
  const variance = totals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totals.length;
  const stdDev = Math.sqrt(variance);

  const highSpending = [];
  const lowSpending = [];

  for (const trend of trends) {
    const deviation = (trend.total - mean) / stdDev;

    if (deviation > threshold) {
      highSpending.push({ ...trend, deviation: deviation.toFixed(2), mean });
    } else if (deviation < -threshold) {
      lowSpending.push({ ...trend, deviation: deviation.toFixed(2), mean });
    }
  }

  return { highSpending, lowSpending };
}

/**
 * Generate spending insights text
 * @param {Object} month - Current month
 * @param {Array} previousMonths - Previous months for comparison
 * @returns {Array} Array of insight strings
 */
export function generateInsights(month, previousMonths = []) {
  const insights = [];

  if (!month) return insights;

  // Top categories
  const top = topCategories(month, 3);
  if (top.length > 0) {
    insights.push(`Top spending: ${top.map(c => `${c.category} (${c.percentage}%)`).join(', ')}`);
  }

  // Daily average
  const daily = dailySpendingAverage(month);
  if (daily.overall > 0) {
    insights.push(`Average daily spending: ₹${daily.overall}`);
  }

  // Comparison with previous month
  if (previousMonths.length > 0) {
    const lastMonth = previousMonths[previousMonths.length - 1];
    const comparison = comparisonMetrics(month, lastMonth);

    if (comparison.totalCurrent > comparison.totalPrevious) {
      const increase = comparison.totalCurrent - comparison.totalPrevious;
      const percent = Math.round((increase / comparison.totalPrevious) * 100);
      insights.push(`Spending increased by ${percent}% (₹${increase}) compared to last month`);
    } else if (comparison.totalCurrent < comparison.totalPrevious) {
      const decrease = comparison.totalPrevious - comparison.totalCurrent;
      const percent = Math.round((decrease / comparison.totalPrevious) * 100);
      insights.push(`Spending decreased by ${percent}% (₹${decrease}) compared to last month`);
    }

    // Category-specific insights
    if (comparison.increased.length > 0) {
      const biggest = comparison.increased[0];
      insights.push(`${biggest.category} increased by ${biggest.percentChange}%`);
    }
    if (comparison.decreased.length > 0) {
      const biggest = comparison.decreased[0];
      insights.push(`${biggest.category} decreased by ${Math.abs(biggest.percentChange)}%`);
    }
  }

  return insights;
}

/**
 * Export all analytics functions
 */
export default {
  categorySpending,
  spendingTrends,
  categoryDistribution,
  weeklySpending,
  comparisonMetrics,
  topCategories,
  dailySpendingAverage,
  identifyAnomalies,
  generateInsights
};
