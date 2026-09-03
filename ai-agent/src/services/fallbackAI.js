/**
 * Fallback AI Service
 * Rule-based responses when no AI API is available
 * Used as a graceful degradation
 */

/**
 * Generate a rule-based spending insight
 * @param {Object} data - Spending data
 * @returns {string} Insight text
 */
export function fallbackSpendingInsight(data) {
  const { categorySpend, totalSpend, monthLabel } = data;

  if (!categorySpend || !totalSpend) {
    return 'No spending data available for analysis yet.';
  }

  const categories = Object.entries(categorySpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (categories.length === 0) {
    return 'No spending recorded this month. Start adding expenses to get insights!';
  }

  const topCategory = categories[0];
  const topPercentage = ((topCategory[1] / totalSpend) * 100).toFixed(1);

  let insight = `In ${monthLabel}, your top spending was on ${topCategory[0]} at ₹${topCategory[1].toLocaleString('en-IN')} (${topPercentage}% of total). `;

  if (categories.length >= 2) {
    insight += `Next largest category: ${categories[1][0]} (₹${categories[1][1].toLocaleString('en-IN')}). `;
  }

  if (topPercentage > 50) {
    insight += 'Consider diversifying your spending across more categories for a balanced budget.';
  } else if (topPercentage < 20) {
    insight += 'Your spending is well-distributed across categories. Good budget management!';
  } else {
    insight += 'This is a healthy distribution. Keep tracking to maintain balance.';
  }

  return insight;
}

/**
 * Generate budget optimization suggestions
 * @param {Object} data - Budget data
 * @returns {Array} Array of suggestion strings
 */
export function fallbackBudgetSuggestions(data) {
  const { income, expenses, savings, bills } = data;
  const suggestions = [];

  const balance = income - expenses - savings;

  if (balance < 0) {
    suggestions.push('⚠️ You are spending more than your income. Consider reducing discretionary expenses.');
  }

  if (savings < 0) {
    suggestions.push('⚠️ Your savings target is not being met. Review your expenses for optimization.');
  }

  if (suggestions.length === 0) {
    suggestions.push('✅ Your budget looks healthy! You are within your means.');
    suggestions.push('💡 Consider increasing your savings target to build an emergency fund.');
  }

  return suggestions;
}

/**
 * Generate savings recommendations
 * @param {Object} data - Savings data
 * @returns {string} Recommendation text
 */
export function fallbackSavingsRecommendation(data) {
  const { currentSavings, target, monthlyIncome } = data;

  if (!target) {
    return 'Set a savings goal to get personalized recommendations.';
  }

  const remaining = target - currentSavings;
  const monthsNeeded = monthlyIncome > 0 ? Math.ceil(remaining / monthlyIncome) : Infinity;

  if (remaining <= 0) {
    return '🎉 Congratulations! You have already reached your savings goal!';
  }

  return `You need ₹${remaining.toLocaleString('en-IN')} more to reach your goal. At your current income, it will take approximately ${monthsNeeded} months. Consider increasing your monthly contribution.`;
}

/**
 * AI service dispatcher
 * Falls back to rule-based if no API key
 */
export async function getAIResponse(provider, apiKey, messages, options = {}) {
  if (!apiKey) {
    // Fallback to rule-based responses
    const lastMessage = messages[messages.length - 1];
    return {
      content: fallbackSpendingInsight(lastMessage),
      model: 'fallback',
      usage: null
    };
  }

  try {
    if (provider === 'groq') {
      const { groqChat } = await import('./groqClient.js');
      return groqChat(apiKey, messages, options);
    }

    if (provider === 'openrouter') {
      const { openrouterChat } = await import('./openrouterClient.js');
      return openrouterChat(apiKey, messages, options);
    }

    throw new Error(`Unknown AI provider: ${provider}`);
  } catch (error) {
    // Fallback to rule-based on any error
    console.warn('AI provider failed, falling back:', error.message);
    const lastMessage = messages[messages.length - 1];
    return {
      content: fallbackSpendingInsight(lastMessage),
      model: 'fallback',
      usage: null
    };
  }
}

export default {
  fallbackSpendingInsight,
  fallbackBudgetSuggestions,
  fallbackSavingsRecommendation,
  getAIResponse
};
