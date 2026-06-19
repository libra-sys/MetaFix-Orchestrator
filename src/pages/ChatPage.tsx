import React, { useState, useEffect, useRef } from 'react';
import { Plus, Send, Bot, User, XCircle, Loader2 } from 'lucide-react';
import type { Session, Message, UnifiedModel } from '../types';
import { API } from '../hooks/useApi';

export default function ChatPage({
  sessions, currentSessionId, setCurrentSessionId, models, currentModel
}: {
  sessions: Session[];
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  models: UnifiedModel[];
  currentModel: UnifiedModel | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (currentSessionId) fetchMessages(currentSessionId); }, [currentSessionId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchMessages = async (sid: string) => {
    try { const r = await fetch(`${API}/sessions/${sid}`); const d = await r.json(); setMessages(d.messages || []); } catch {}
  };

  const createSession = async () => {
    try {
      const r = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel?.modelId || 'claude-sonnet-4', title: '新对话' }) });
      const d = await r.json();
      if (d.session) { window.location.reload(); }
    } catch {}
  };

  const deleteSession = async (id: string) => {
    try { await fetch(`${API}/sessions/${id}`, { method: 'DELETE' }); if (currentSessionId === id) { setCurrentSessionId(null); setMessages([]); } window.location.reload(); } catch {}
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setLoading(true);

    let sid = currentSessionId;
    if (!sid) {
      try {
        const r = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel?.modelId, title: text.slice(0, 30) }) });
        const d = await r.json();
        if (d.session) { sid = d.session.id; setCurrentSessionId(sid); }
      } catch { setLoading(false); return; }
    }

    const tempUserMsg: Message = { id: `temp-${Date.now()}`, session_id: sid!, role: 'user', content: text, model: null, created_at: new Date().toISOString(), tool_calls: null };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const resp = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: text, model: currentModel?.modelId, permissionMode: 'default' }),
      });
      if (!resp.body) throw new Error('无响应');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let assistantMsgId = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));
        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'init') assistantMsgId = parsed.assistantMessageId;
            if (parsed.type === 'text') { assistantContent += parsed.content; setMessages(prev => { const filtered = prev.filter(m => m.id !== assistantMsgId); return [...filtered, { id: assistantMsgId || `a-${Date.now()}`, session_id: sid!, role: 'assistant', content: assistantContent, model: currentModel?.modelId || null, created_at: new Date().toISOString(), tool_calls: null }]; }); }
            if (parsed.type === 'error') { setMessages(prev => [...prev, { id: `err-${Date.now()}`, session_id: sid!, role: 'assistant', content: `错误: ${parsed.message}`, model: null, created_at: new Date().toISOString(), tool_calls: null }]); }
          } catch {}
        }
      }
      await fetchMessages(sid!);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, session_id: sid!, role: 'assistant', content: `请求失败: ${e?.message || '未知错误'}`, model: null, created_at: new Date().toISOString(), tool_calls: null }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-full gap-4">
      <div className="w-64 flex-shrink-0 flex flex-col gap-2">
        <button onClick={createSession} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-[var(--td-border-level-1-color)] text-[var(--text-secondary)] text-sm hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors">
          <Plus size={16} /> 新建会话
        </button>
        <div className="flex-1 overflow-auto space-y-1 pr-1">
          {sessions.map(s => (
            <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20' : 'hover:bg-[var(--bg-hover)] border border-transparent'}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.title}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{s.messageCount || 0} 条消息</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                <XCircle size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-field)] rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)]">
              <Bot size={48} className="mb-4 opacity-40" />
              <p className="text-sm">开始一个新的对话</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={m.id || i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs ${m.role === 'user' ? 'bg-gradient-to-br from-[var(--accent-secondary)] to-pink-400' : 'bg-gradient-to-br from-[var(--accent-primary)] to-[#8B5CF6]'}`}>
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-[var(--accent-primary)] text-white rounded-tr-sm' : 'bg-white text-[var(--text-primary)] shadow-sm rounded-tl-sm'}`}>
                <pre className="whitespace-pre-wrap font-[Inter] text-[13px]">{m.content}</pre>
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-[var(--accent-primary)] to-[#8B5CF6]"><Loader2 size={14} className="text-white animate-spin" /></div>
              <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm"><span className="text-sm text-[var(--text-secondary)]">思考中...</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-white border-t border-[var(--td-border-level-1-color)]">
          <div className="flex items-center gap-3">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} placeholder="输入消息..." className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-field)] text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 transition-all" />
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="w-11 h-11 rounded-xl bg-[var(--accent-primary)] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-lg shadow-[var(--accent-primary)]/20">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
