import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiStream } from '../api/client';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ToolStatus from '../components/chat/ToolStatus';
import SessionPicker from '../components/chat/SessionPicker';
import { createSseParser } from '../components/chat/sseParser';
import ErrorBanner from '../components/shared/ErrorBanner';
import '../components/chat/chat.css';

const GREETING = { role: 'assistant', text: 'Hi! How can I help you today?' };

// The chat screen. Owns conversation state, drives the SSE stream from the
// backend, and renders the streaming response with markdown, a thinking
// indicator, and tool-use status. Uses M4's api client for every call.
export default function Chat() {
  const [messages, setMessages] = useState([GREETING]);
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

  // ---- Auto-scroll -----------------------------------------------------
  // Follow new content while streaming, but back off the moment the user
  // scrolls up to read history; resume once they return to the bottom.
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

  // ---- SSE event handling ----------------------------------------------
  // Append streamed text to the in-progress assistant bubble (the last
  // message in the list, which we add right before the stream starts).
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
        // A tool started -- clear the thinking dots and show its status.
        setThinking(false);
        setToolName(evt.name);
        break;
      case 'token':
        // First visible text -- clear thinking/tool indicators.
        setThinking(false);
        setToolName(null);
        if (evt.text) appendToken(evt.text);
        break;
      case 'done':
        if (evt.sessionId) setSessionId(evt.sessionId);
        break;
      case 'error':
        setError(evt.message || 'Something went wrong. Please try again.');
        break;
      default:
        break;
    }
  }

  // ---- Sending ----------------------------------------------------------
  async function send(text) {
    setError('');
    stickToBottom.current = true;

    // Add the user's message and an empty assistant bubble we will fill.
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
        setError('Something went wrong while sending your message. Please try again.');
      }
    } finally {
      setStreaming(false);
      setThinking(false);
      setToolName(null);
      abortRef.current = null;
      // Drop the trailing assistant bubble if it never received any text.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.text === '') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  }

  // ---- Conversation switching ------------------------------------------
  function startNewConversation() {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(null);
    setMessages([GREETING]);
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

    // Load and show the actual past conversation. The backend continues the
    // real Claude session via this id on the next send.
    setMessages([{ role: 'assistant', text: 'Loading this conversation...' }]);
    try {
      const data = await apiGet(`/sessions/${id}/messages`);
      const loaded = Array.isArray(data)
        ? data.map((m) => ({ role: m.role, text: m.text }))
        : [];
      setMessages(
        loaded.length > 0
          ? loaded
          : [
              GREETING,
              {
                role: 'assistant',
                text: "We're picking up where you left off. What would you like to do next?",
              },
            ],
      );
    } catch {
      setError("Couldn't load that conversation. You can still continue it by sending a message.");
      setMessages([GREETING]);
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
          Your conversations
        </button>
        <button type="button" className="chat__new" onClick={startNewConversation}>
          New
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
