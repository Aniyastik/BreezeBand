import React, { useState, useRef, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function AIConcierge({ nfcUid }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', content: "Hello! I am your BreezeBand AI Concierge. How can I help you enjoy your stay at Sea Breeze today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfc_uid: nfcUid,
          message: userMessage
        })
      });

      if (!response.ok) throw new Error("Failed to connect to AI");

      const data = await response.json();
      
      // Simulate a small delay for "thinking" effect
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);
        setIsTyping(false);
      }, 600);

    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I am having trouble connecting right now." }]);
      setIsTyping(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Chat Window */}
      {isOpen && (
        <div style={{
          width: 340,
          height: 450,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          marginBottom: 16,
          border: '1px solid rgba(41,114,136,0.1)'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #1e5566, #297288)',
            padding: '16px 20px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Breeze AI Concierge</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Sea Breeze Resort</div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: 20 }}
            >
              ×
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            padding: 16,
            overflowY: 'auto',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? '#297288' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#1e293b',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                maxWidth: '85%',
                fontSize: 14,
                lineHeight: '1.4',
                boxShadow: msg.role === 'ai' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                border: msg.role === 'ai' ? '1px solid #e2e8f0' : 'none'
              }}>
                {msg.content}
              </div>
            ))}
            {isTyping && (
              <div style={{
                alignSelf: 'flex-start',
                background: '#fff',
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                color: '#64748b'
              }}>
                Typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: 12,
            background: '#fff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: 8
          }}>
            <input 
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 20,
                border: '1px solid #cbd5e1',
                outline: 'none',
                fontSize: 14
              }}
            />
            <button 
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              style={{
                background: '#297288',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                cursor: (isTyping || !input.trim()) ? 'default' : 'pointer',
                opacity: (isTyping || !input.trim()) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            background: 'linear-gradient(135deg, #1e5566, #297288)',
            color: 'white',
            border: 'none',
            boxShadow: '0 8px 24px rgba(41,114,136,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            transition: 'transform 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          ✨
        </button>
      )}
    </div>
  );
}

export default AIConcierge;
