/**
 * Groq AI Client - Free, Fast, and High Quality
 * Model: mixtral-8x7b-32768 or llama3-8b-8192
 * Speed: ~500 tokens/sec
 * Free tier: Generous credits for development
 */

/**
 * Configuration for Groq API
 * Env vars: AI_API_KEY (Groq API key), AI_MODEL (optional)
 */
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama3-8b-8192'; // Fast and accurate
const ALTERNATIVE_MODELS = [
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

export const groqModels = {
  fast: 'llama3-8b-8192',
  quality: 'mixtral-8x7b-32768',
  balanced: 'llama-3.1-8b-instant'
};

/**
 * Send a message to Groq AI
 * @param {string} apiKey - Groq API key
 * @param {Array} messages - Chat messages [{ role: 'user'|'assistant'|'system', content: string }]
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} AI response
 */
export async function groqChat(apiKey, messages, options = {}) {
  if (!apiKey) {
    throw new Error('Groq API key is required. Add AI_API_KEY to your .env file.');
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 2048,
    stream = false
  } = options;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
    stop: null
  };

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Groq API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Groq AI');
    }

    return {
      content: data.choices[0].message.content,
      finishReason: data.choices[0].finish_reason,
      model: data.model,
      usage: data.usage || null
    };
  } catch (error) {
    if (error.message.includes('API key')) throw error;
    throw new Error(`Failed to communicate with Groq AI: ${error.message}`);
  }
}

/**
 * Test Groq API connectivity
 * @param {string} apiKey - Groq API key
 * @returns {Promise<boolean>} True if connected
 */
export async function testGroqConnection(apiKey) {
  try {
    await groqChat(apiKey, [
      { role: 'user', content: 'Hello' }
    ], { maxTokens: 10 });
    return true;
  } catch (error) {
    console.error('Groq connection test failed:', error.message);
    return false;
  }
}

/**
 * Get available Groq models
 * @param {string} apiKey - Groq API key
 * @returns {Promise<Array>} List of models
 */
export async function getGroqModels(apiKey) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.warn('Could not fetch Groq models:', error.message);
    return ALTERNATIVE_MODELS.map(id => ({ id, name: id }));
  }
}

export default {
  groqChat,
  testGroqConnection,
  getGroqModels,
  groqModels,
  DEFAULT_MODEL
};
