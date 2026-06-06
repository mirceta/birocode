import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiStream } from '../api/client';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ToolStatus from '../components/chat/ToolStatus';
import SessionPicker from '../components/chat/SessionPicker';
import { createSseParser } from '../components/chat/sseParser';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import '../components/chat/chat.css';

export default function Chat() {
  const { t } = useT();
  const greeting = { role: 'assistant', text: t('chat.greeting') };

  const [messages, setMessages] = useState([greeting]);
  const [sessionId, setSessionId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [toolName, setToolName] = useState(null);
  const [error, setError] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 40;
  }

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages, thinking, toolName, scrollToBottom]);

  const appendToken = useCallback((text) => {
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.role === 'assistant') {
        next[next.length - 1] = { ...last, text: last.text + text };
      }
      return next;
    });
  }, []);

  function handleEvent(evt) {
    switch (evt.type) {
      case 'session':
        if (evt.sessionId) setSessionId(evt.sessionId);
        break;
      case 'thinking':
        setThinking(true);
        break;
      case 'tool':
        setThinking(false);
        setToolName(evt.name);
        break;
      case 'token':
        setThinking(false);
        setToolName(null);
        if (evt.text) appendToken(evt.text);
        break;
      case 'done':
        if (evt.sessionId) setSessionId(evt.sessionId);
        break;
      case 'error':
        setError(evt.message || t('chat.genericError'));
        break;
      default:
        break;
    }
  }

  async function send(text) {
    setError('');
    stickToBottom.current = true;

    setMessages((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: '' },
    ]);
    setStreaming(true);
    setThinking(true);
    setToolName(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const parse = createSseParser(handleEvent);

    try {
      const body = { message: text };
      if (sessionId) body.sessionId = sessionId;
      await apiStream('/chat', body, parse, { signal: controller.signal });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(t('chat.sendError'));
      }
    } finally {
      setStreaming(false);
      setThinking(false);
      setToolName(null);
      abortRef.current = null;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.text === '') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  }

  function startNewConversation() {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(null);
    setMessages([greeting]);
    setError('');
    setThinking(false);
    setToolName(null);
    setStreaming(false);
    setPickerOpen(false);
  }

  async function resumeConversation(id) {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(id);
    setError('');
    setThinking(false);
    setToolName(null);
    setStreaming(false);
    setPickerOpen(false);
    stickToBottom.current = true;

    setMessages([{ role: 'assistant', text: t('chat.loadingConversation') }]);
    try {
      const data = await apiGet(`/sessions/${id}/messages`);
      const loaded = Array.isArray(data)
        ? data.map((m) => ({ role: m.role, text: m.text }))
        : [];
      setMessages(
        loaded.length > 0
          ? loaded
          : [greeting, { role: 'assistant', text: t('chat.resumed') }],
      );
    } catch {
      setError(t('chat.resumeError'));
      setMessages([greeting]);
    }
  }

  async function openPicker() {
    setPickerOpen(true);
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const data = await apiGet('/sessions');
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat__bar">
        <button
          type="button"
          className="chat__conversations"
          onClick={openPicker}
        >
          {t('chat.yourConversations')}
        </button>
        <button type="button" className="chat__new" onClick={startNewConversation}>
          {t('chat.new')}
        </button>
      </div>

      <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} />
        ))}
        {thinking && <ThinkingIndicator />}
        {toolName && <ToolStatus name={toolName} />}
        {error && <ErrorBanner message={error} />}
      </div>

      <ChatInput onSend={send} disabled={streaming} />

      <SessionPicker
        open={pickerOpen}
        sessions={sessions}
        loading={sessionsLoading}
        error={sessionsError}
        activeId={sessionId}
        onSelect={resumeConversation}
        onNew={startNewConversation}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
