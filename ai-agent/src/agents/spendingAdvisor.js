/**
 * AI Spending Advisor Agent
 * Analyzes user spending patterns and provides personalized recommendations
 * Free AI integration using Groq (with fallback to rule-based logic)
 */

/**
 * Analyze monthly spending and provide insights
 * @param {Object} spendingData - Current month spending data
 * @param {Array} historicalData - Previous months' spending data
 * @param {string} apiKey - AI API key (optional, falls back to rule-based)
 * @param {string} provider - AI provider ('groq', 'openrouter', 'fallback')
 * @returns {Object} { success: boolean, insights: string, model: string }
 */
export async function analyzeSpending(spendingData, historicalData = [], apiKey, provider = 'fallback') {
  // Build messages for AI
  const messages = [
    {
      role: 'system',
      content: `You are an expert financial advisor helping a user manage their personal budget.
      Provide practical, actionable insights about their spending patterns.
      Focus on:
      - Identifying areas where they can save money
      - Warning about unusual spending patterns
      - Suggesting specific budget adjustments
      - Recommending savings opportunities
      - Keeping responses concise (under 300 words)
      - Use a friendly, encouraging tone
      - Always mention at least one positive observation
      - Recommend setting up savings goals if none exist`
    },
    {
      role: 'user',
      content: `
      Current Month Analysis:
      - Total spending: ₹${(spendingData.totalSpend || 0).toLocaleString('en-IN')}
      - Category breakdown: ${JSON.stringify(spendingData.categorySpend || {})}
      - Top spending categories: ${Object.entries(spendingData.categorySpend || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(c => `${c[0]}: ₹${c[1].toLocaleString('en-IN')}`)
        .join(', ')}
      - Number of transactions: ${spendingData.transactionCount || 0}

      Historical Context:
      - ${historicalData.length > 0 ? 'Previous ' + historicalData.length + ' months available' : 'No historical data available'}

      Provide 3-5 specific, personalized recommendations based on this data.
      `
    }
  ];

  return await getAIResponse(provider, apiKey, messages);
}

/**
 * Detect spending anomalies and provide warnings
 * @param {Object} currentMonth - Current month spending
 * @param {Array} previousMonths - Previous months data
 * @param {string} apiKey - AI API key
 * @param {string} provider - AI provider
 * @returns {Object} { anomalies: Array, warnings: Array }
 */
export async function detectAnomalies(currentMonth, previousMonths, apiKey, provider = 'fallback') {
  const messages = [
    {
      role: 'system',
      content: 'You are a financial analyst detecting spending anomalies and warning signs. Identify unusual patterns in the user\'s spending data and provide specific warnings.'
    },
    {
      role: 'user',
      content: `
      Current month spending data: ${JSON.stringify(currentMonth)}
      Previous months data: ${JSON.stringify(previousMonths.map(m => ({
        month: m.id,
        total: Object.values(m.categorySpending || {}).reduce((a, b) => a + b, 0),
        transactions: m.transactions?.length || 0
      })))}

      Analyze for:
      1. Unusual spikes in spending
      2. Categories that are significantly higher than historical average
      3. Warning signs of budget exhaustion
      4. Potential areas of overspending

      Return as JSON with fields:
      - anomalies: Array of detected anomalies with descriptions
      - warnings: Array of warning messages
      - recommendations: Array of specific recommendations
      - riskLevel: "low" | "medium" | "high"
      `
    }
  ];

  const response = await getAIResponse(provider, apiKey, messages);

  // Try to parse JSON from response
  try {
    const parsed = JSON.parse(response.content);
    return {
      anomalies: parsed.anomalies || [],
      warnings: parsed.warnings || [],
      recommendations: parsed.recommendations || [],
      riskLevel: parsed.riskLevel || 'low'
    };
  } catch (e) {
    // Fallback to rule-based detection
    return fallbackAnomalyDetection(currentMonth, previousMonths);
  }
}

/**
 * Rule-based anomaly detection fallback
 * @param {Object} currentMonth - Current month spending
 * @param {Array} previousMonths - Previous months data
 * @returns {Object} Detected anomalies
 */
function fallbackAnomalyDetection(currentMonth, previousMonths) {
  const anomalies = [];
  const warnings = [];
  const recommendations = [];
  let riskLevel = 'low';

  if (!currentMonth || !currentMonth.categorySpend) {
    return { anomalies, warnings, recommendations, riskLevel };
  }

  const currentTotal = Object.values(currentMonth.categorySpend).reduce((a, b) => a + b, 0);
  const prevTotals = previousMonths.map(m =>
    Object.values(m.categorySpending || {}).reduce((a, b) => a + b, 0)
  );

  // Check for significant changes
  if (prevTotals.length > 0) {
    const avgPrevious = prevTotals.reduce((a, b) => a + b, 0) / prevTotals.length;
    const changePercent = ((currentTotal - avgPrevious) / avgPrevious) * 100;

    if (Math.abs(changePercent) > 50) {
      warnings.push(`Spending changed by ${changePercent.toFixed(0)}% compared to your average. Review recent transactions.`);
      recommendations.push('Review your recent expenses to identify the cause of this change.');
      if (riskLevel !== 'high') riskLevel = 'medium';
    }
  }

  // Check for top category dominance
  const topCategory = Object.entries(currentMonth.categorySpend).sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] / currentTotal > 0.6) {
    anomalies.push(`Top category "${topCategory[0]}" represents ${(topCategory[1] / currentTotal * 100).toFixed(0)}% of all spending. This may indicate budget imbalance.`);
    warnings.push(`Be mindful of ${topCategory[0]} expenses - they make up most of your spending.`);
    recommendations.push(`Set a budget cap for ${topCategory[0]} and track it weekly.`);
    if (riskLevel !== 'high') riskLevel = 'medium';
  }

  // Check for new categories
  const prevCategories = new Set();
  previousMonths.forEach(m => {
    Object.keys(m.categorySpending || {}).forEach(k => prevCategories.add(k));
  });
  const currentCategories = Object.keys(currentMonth.categorySpending || {});
  const newCategories = currentCategories.filter(c => !prevCategories.has(c));

  if (newCategories.length > 0) {
    anomalies.push(`New spending category detected: ${newCategories.join(', ')}. Track these expenses.`);
    warnings.push(`You have new spending categories that weren't tracked before.`);
    recommendations.push('Track these new expenses for the next month to understand their impact.');
  }

  return { anomalies, warnings, recommendations, riskLevel };
}

/**
 * Generate savings recommendations
 * @param {Object} savingsData - Current savings status
 * @param {Object} budgetData - Overall budget info
 * @param {string} apiKey - AI API key
 * @param {string} provider - AI provider
 * @returns {Object} { success: boolean, recommendations: Array }
 */
export async function generateSavingsRecommendations(savingsData, budgetData, apiKey, provider = 'fallback') {
  const messages = [
    {
      role: 'system',
      content: 'You are a financial planner helping users optimize their savings. Provide practical suggestions based on their income, expenses, and goals. Keep responses under 200 words.'
    },
    {
      role: 'user',
      content: `
      Current savings status:
      - General savings: ₹${(savingsData.general || 0).toLocaleString('en-IN')}
      - RD installment: ₹${(savingsData.rdInstallment || 0).toLocaleString('en-IN')}
      - Recovery goal: ₹${(savingsData.recoveryTarget || 0).toLocaleString('en-IN')}
      - Monthly income: ₹${(budgetData.income || 0).toLocaleString('en-IN')}
      - Monthly expenses: ₹${(budgetData.expenses || 0).toLocaleString('en-IN')}
      - Current month remaining: ₹${(budgetData.remaining || 0).toLocaleString('en-IN')}

      Provide 3-5 specific savings optimization recommendations.
      `
    }
  ];

  return await getAIResponse(provider, apiKey, messages);
}

export default {
  analyzeSpending,
  detectAnomalies,
  generateSavingsRecommendations
};