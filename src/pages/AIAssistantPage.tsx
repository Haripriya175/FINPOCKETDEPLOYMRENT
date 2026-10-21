import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AIAssistantService } from '../services/aiAssistant';
import {
  Sparkles,
  Send,
  HelpCircle,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'USER' | 'AI';
  text: string;
  timestamp: string;
}

const suggestedQuestions = [
  'How much did I spend this month?',
  'Where am I spending the most?',
  'How much did I spend on food?',
  'How much is in my emergency fund?',
  'When is my next EMI?',
  'How much money do I have in total?',
];

export const AIAssistantPage: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'AI',
      text: 'Hello Jithendra! I am your FinPocket AI Assistant. Ask me anything about your balances, spending trends, savings goals, or upcoming bills.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const healthScore = AIAssistantService.getFinancialHealthScore();
  const dailyTip = AIAssistantService.getDailySavingTip();

  const handleSend = (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      sender: 'USER',
      text: q,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsTyping(true);

    setTimeout(() => {
      const answer = AIAssistantService.askQuestion(q);
      const aiMsg: ChatMessage = {
        id: 'ai_' + Date.now(),
        sender: 'AI',
        text: answer,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <div className="mobile-body animate-fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {t.aiAssistantTitle}
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Deterministic financial insights backed by your accounts
          </span>
        </div>
      </div>

      {/* Financial Health Score Overview Widget */}
      <div className="fp-card" style={{ marginBottom: '14px', background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            {t.financialHealth}
          </span>
          <span className="badge badge-teal">{healthScore.grade}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary-light)' }}>
            {healthScore.score}
          </span>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/ 100</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
          {healthScore.factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {f.status === 'POSITIVE' ? (
                <CheckCircle2 size={13} color="var(--success)" />
              ) : (
                <AlertCircle size={13} color="var(--warning)" />
              )}
              <span>{f.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Query Chips */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '10px' }}>
        {suggestedQuestions.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '16px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '10px 0',
        }}
      >
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.sender === 'USER' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: msg.sender === 'USER' ? 'var(--primary)' : 'var(--bg-card)',
              color: msg.sender === 'USER' ? '#ffffff' : 'var(--text-primary)',
              border: msg.sender === 'AI' ? '1px solid var(--border-color)' : 'none',
              borderRadius: '16px',
              borderBottomRightRadius: msg.sender === 'USER' ? '4px' : '16px',
              borderBottomLeftRadius: msg.sender === 'AI' ? '4px' : '16px',
              padding: '10px 14px',
              fontSize: '13px',
              lineHeight: '1.45',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {msg.text}
          </div>
        ))}

        {isTyping && (
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'var(--bg-card)',
              borderRadius: '14px',
              padding: '8px 12px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            FinPocket is calculating insights...
          </div>
        )}
      </div>

      {/* Chat Input Field */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
        <input
          className="fp-input"
          style={{ fontSize: '13px', padding: '10px 14px' }}
          placeholder="Ask a financial question..."
          value={inputQuery}
          onChange={e => setInputQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSend();
          }}
        />
        <button
          className="btn-primary"
          onClick={() => handleSend()}
          style={{ width: '48px', height: '44px', padding: 0 }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
