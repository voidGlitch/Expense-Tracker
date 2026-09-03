/**
 * OpenRouter AI Client
 * Access multiple models through one API
 * Free tier available with good quality models
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-lite'; // Free & fast

/**
 * Send a message via OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @param {Array} messages - Chat messages
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} AI response
 */
export async function openrouterChat(apiKey, messages, options = {}) {
  if (!apiKey) {
    throw new Error('OpenRouter API key is required. Add AI_API_KEY to your .env file.');
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 2048
  } = options;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://expense-manager.app',
    'X-Title': 'Expense Manager AI'
  };

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenRouter API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from OpenRouter AI');
    }

    return {
      content: data.choices[0].message.content,
      finishReason: data.choices[0].finish_reason,
      model: data.model,
      usage: data.usage || null
    };
  } catch (error) {
    if (error.message.includes('API key')) throw error;
    throw new Error(`Failed to communicate with OpenRouter AI: ${error.message}`);
  }
}

/**
 * Test OpenRouter connectivity
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<boolean>} True if connected
 */
export async function testOpenRouterConnection(apiKey) {
  try {
    await openrouterChat(apiKey, [
      { role: 'user', content: 'Hello' }
    ], { maxTokens: 10 });
    return true;
  } catch (error) {
    console.error('OpenRouter connection test failed:', error.message);
    return false;
  }
}

export default {
  openrouterChat,
  testOpenRouterConnection,
  DEFAULT_MODEL
};
