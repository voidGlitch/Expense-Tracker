/**
 * AI Chat Modal Component
 * Provides AI-powered spending analysis and budget recommendations
 * Integrated in the sidebar with free AI API (Groq/OpenRouter)
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Card, EmptyState, Stat, ProgressBar } from './ui.jsx';
import { groqChat } from '../services/groqClient.js';
import { fallbackSpendingInsight, fallbackBudgetSuggestions } from '../services/fallbackAI.js';
import { formatMonthLabel } from '@expense/shared';

export default function AIChatModal({
  apiKey,
  onClose,
  onAnalyze,
  monthlyData,
  previousMonths
}) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '👋 Hello! I\'m your AI budget assistant. Ask me about your spending patterns, savings tips, or budget optimization. I can analyze your monthly expenses and provide personalized recommendations!' }
  ]);
  const [response, setResponse] = useState(null);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [provider, setProvider] = useState('groq'); // or 'openrouter', 'fallback'
  const apiKeyRef = useRef(apiKey);

  // Update ref when apiKey changes
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  // Auto-analyze when data changes
  useEffect(() => {
    if (monthlyData && !loading && messages.length <= 1) {
      analyzeCurrentMonth(monthlyData);
    }
  }, [monthlyData, loading]);

  const analyzeCurrentMonth = async (data) => {
    if (!apiKeyRef.current) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '🔑 To use AI features, add AI_API_KEY to your .env file. In the meantime, I\'ll give you rule-based insights!' }
      ]);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: fallbackSpendingInsight(data) }
      ]);
      return;
    }

    setLoading(true);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '🤔 Analyzing your spending patterns…' }
    ]);

    try {
      const result = await groqChat(apiKeyRef.current, [
        {
          role: 'system',
          content: `You are a helpful financial AI assistant for the Expense Manager app. Analyze the user's spending data and provide:
          - Key insights about their spending patterns
          - 3-5 specific recommendations
          - Positive observations
          - Keep it under 300 words
          - Format nicely with emojis
          Data: ${JSON.stringify(data)}`
        },
        { role: 'user', content: 'Analyze my spending' }
      ], { maxTokens: 500 });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.content }
      ]);
      setResponse(result);

    } catch (error) {
      console.error('AI analysis error:', error.message);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ AI analysis failed. Here\'s a rule-based insight instead:' }
      ]);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: fallbackSpendingInsight(data) }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');

    if (!apiKeyRef.current) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: fallbackSpendingInsight({ transactionCount: 1 }) }
      ]);
      return;
    }

    setLoading(true);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '🤔 Thinking...' }
    ]);

    try {
      const result = await groqChat(apiKeyRef.current, [
        ...messages,
        userMessage,
        { role: 'assistant', content: response?.content || '' }
      ], { maxTokens: 500 });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.content }
      ]);
      setResponse(result);

    } catch (error) {
      console.error('AI chat error:', error.message);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ AI is temporarily unavailable. Here\'s a quick insight:' }
      ]);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: fallbackSpendingInsight({ transactionCount: 1 }) }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hidden sm:block" style={{ transform: visible ? 'scaleY(1)' : 'scaleY(0)', opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}>
      <Card variant="subtle" className="h-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">💡 AI Budget Assistant</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-300"
            title="Close AI chat"
          >
            ✕
          </Button>
        </div>

        {/* Chat History */}
        <div className="h-64 overflow-y-auto space-y-2 p-2" style={{ maxHeight: '300px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`
                rounded-lg p-3 max-w-lg ${
                  msg.role === 'user'
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20'
                    : 'bg-slate-50 text-slate-800 dark:bg-slate-800/20 dark:text-slate-200'
                }
              `}
            >
              <p className="text-sm line-clamp-4">{msg.content}</p>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {messages.length <= 1 && !loading && (
          <EmptyState
            title="Start a conversation"
            children="Ask me about your spending, savings, or budget optimization. I'll analyze your data and give you personalized tips!"
          />
        )}

        {/* Loading State */}
        {loading && (
          <div className="h-24 flex items-center justify-center">
            <Loader2 size={16} className="mr-2" /> Analyzing...
          </div>
        )}

        {/* Input Area */}
        <form
          onSubmit={handleSubmit}
          className="mt-4 flex gap-2"
          style={{ maxHeight: '100px', overflow: 'hidden' }}
        >
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
            placeholder="Ask about your spending..."
            className={`flex-1 rounded-xl px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
              inputDisabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={loading}
            aria-label="AI chat input"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading || !message.trim()}
            className="px-4"
            title="Send to AI"
          >
            {loading ? 'Sending…' : 'Send'}
          </Button>
        </form>
      </Card>
    </div>
  );
}