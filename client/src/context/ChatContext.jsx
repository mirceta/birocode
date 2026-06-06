import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { apiGet, apiStream } from '../api/client';
import { createSseParser } from '../components/chat/sseParser';
import { useT } from '../i18n/LanguageContext';

// Holds the chat conversation (messages + the session being continued) and the
// streaming logic. Mounted in Layout, which stays mounted across tab switches,
// so navigating to Files/History and back no longer resets the conversation.
// An in-progress stream also survives navigation, since the abort controller
// and state live here rather than in the (unmounted) Chat page.
const ChatContext = createContext(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a <ChatProvider>');
  return ctx;
}

export function ChatProvider({ children }) {
  const { t } = useT();
  const greeting = () => ({ role: 'assistant', text: t('chat.greeting') });

  const [messages, setMessages] = useState(() => [greeting()]);
  const [sessionId, setSessionId] = useState(null);
  // The unsent composer text. Lives here (not in ChatInput) so it survives
  // navigating to other tabs and back, and so other tabs (e.g. Files) can drop
  // a file reference into it.
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [toolName, setToolName] = useState(null);
  const [error, setError] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  const abortRef = useRef(null);

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
    setDraft(''); // clear the composer the moment the message is sent
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
    setMessages([greeting()]);
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

    setMessages([{ role: 'assistant', text: t('chat.loadingConversation') }]);
    try {
      const data = await apiGet(`/sessions/${id}/messages`);
      const loaded = Array.isArray(data)
        ? data.map((m) => ({ role: m.role, text: m.text }))
        : [];
      setMessages(
        loaded.length > 0
          ? loaded
          : [greeting(), { role: 'assistant', text: t('chat.resumed') }],
      );
    } catch {
      setError(t('chat.resumeError'));
      setMessages([greeting()]);
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

  const value = {
    messages,
    sessionId,
    draft,
    setDraft,
    streaming,
    thinking,
    toolName,
    error,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    send,
    startNewConversation,
    resumeConversation,
    openPicker,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
