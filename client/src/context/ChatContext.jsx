import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiGet, apiStream, apiUpload } from '../api/client';
import { createSseParser } from '../components/chat/sseParser';
import { useRepo } from './RepoContext';
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
  const { currentRepoId } = useRepo();
  const greeting = () => ({ role: 'assistant', text: t('chat.greeting') });

  const [messages, setMessages] = useState(() => [greeting()]);
  const [sessionId, setSessionId] = useState(null);
  // The unsent composer text. Lives here (not in ChatInput) so it survives
  // navigating to other tabs and back, and so other tabs (e.g. Files) can drop
  // a file reference into it.
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  const abortRef = useRef(null);

  // Sessions are scoped to a repository, so switching projects starts a fresh
  // conversation. Skip the very first run (no real switch has happened yet).
  const prevRepoRef = useRef(currentRepoId);
  useEffect(() => {
    if (prevRepoRef.current === currentRepoId) return;
    prevRepoRef.current = currentRepoId;
    startNewConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRepoId]);

  // Update the last message in place, but only if it is the (streaming) assistant
  // turn. `updater` receives the message and returns a new one.
  const updateAssistant = useCallback((updater) => {
    setMessages((prev) => {
      const next = prev.slice();
      const i = next.length - 1;
      if (i >= 0 && next[i].role === 'assistant') next[i] = updater(next[i]);
      return next;
    });
  }, []);

  const appendToken = useCallback(
    (text) => updateAssistant((m) => ({ ...m, text: m.text + text })),
    [updateAssistant],
  );

  // --- activity steps (the verbose trail under a turn) --------------------
  // Each assistant turn carries an ordered `steps` array: contiguous thinking is
  // one { kind:'thinking', text } step; each tool call is a { kind:'tool', id,
  // name, summary, detail, status:'running'|'done'|'error', preview, startedAt }.

  const addThinking = useCallback(
    (text) =>
      updateAssistant((m) => {
        const steps = (m.steps || []).slice();
        const last = steps[steps.length - 1];
        if (last && last.kind === 'thinking') {
          steps[steps.length - 1] = { ...last, text: last.text + (text || '') };
        } else {
          steps.push({ kind: 'thinking', text: text || '' });
        }
        return { ...m, steps };
      }),
    [updateAssistant],
  );

  const handleTool = useCallback(
    (evt) =>
      updateAssistant((m) => {
        const steps = (m.steps || []).slice();
        let idx = evt.id ? steps.findIndex((s) => s.kind === 'tool' && s.id === evt.id) : -1;

        if (evt.status === 'start' || evt.status === 'input') {
          if (idx === -1) {
            steps.push({
              kind: 'tool',
              id: evt.id,
              name: evt.name || 'tool',
              status: 'running',
              startedAt: Date.now(),
              summary: evt.summary || '',
              detail: evt.detail || '',
              preview: '',
            });
          } else {
            steps[idx] = {
              ...steps[idx],
              name: evt.name || steps[idx].name,
              summary: evt.summary ?? steps[idx].summary,
              detail: evt.detail ?? steps[idx].detail,
            };
          }
        } else if (evt.status === 'end') {
          // Match by id, else fall back to the most recent still-running tool.
          if (idx === -1) {
            for (let j = steps.length - 1; j >= 0; j--) {
              if (steps[j].kind === 'tool' && steps[j].status === 'running') {
                idx = j;
                break;
              }
            }
          }
          if (idx !== -1) {
            steps[idx] = {
              ...steps[idx],
              status: evt.ok === false ? 'error' : 'done',
              ok: evt.ok !== false,
              preview: evt.preview || '',
            };
          }
        }
        return { ...m, steps };
      }),
    [updateAssistant],
  );

  function handleEvent(evt) {
    switch (evt.type) {
      case 'session':
        if (evt.sessionId) setSessionId(evt.sessionId);
        break;
      case 'thinking':
        addThinking(evt.text);
        break;
      case 'tool':
        handleTool(evt);
        break;
      case 'token':
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
    const pendingFile = attachment;
    setDraft(''); // clear the composer the moment the message is sent
    setAttachment(null);

    // Upload the attachment first (if any) and build the final prompt.
    let fullText = text;
    if (pendingFile) {
      try {
        const result = await apiUpload('/upload', pendingFile);
        const suffix = `\n\n[Attached file: ${result.path}]`;
        fullText = text ? text + suffix : suffix;
      } catch {
        setError(t('chat.uploadError'));
        setDraft(text); // restore the draft so the user doesn't lose their message
        return;
      }
    }

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: fullText },
      { role: 'assistant', text: '', steps: [] },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const parse = createSseParser(handleEvent);

    try {
      const body = { message: fullText };
      if (sessionId) body.sessionId = sessionId;
      await apiStream('/chat', body, parse, { signal: controller.signal });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(t('chat.sendError'));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          // Drop a truly empty turn (no answer text and no activity).
          if (last.text === '' && (!last.steps || last.steps.length === 0)) {
            return next.slice(0, -1);
          }
          // Close out any tool step still spinning (e.g. on early stream end).
          if (last.steps?.some((s) => s.kind === 'tool' && s.status === 'running')) {
            next[next.length - 1] = {
              ...last,
              steps: last.steps.map((s) =>
                s.kind === 'tool' && s.status === 'running' ? { ...s, status: 'done' } : s,
              ),
            };
          }
        }
        return next;
      });
    }
  }

  // Interrupt the in-flight turn. Aborting the fetch closes the SSE connection,
  // which fires HttpContext.RequestAborted on the server -> the CLI process is
  // killed. send()'s catch treats AbortError as a normal stop.
  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  function startNewConversation() {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(null);
    setMessages([greeting()]);
    setError('');
    setStreaming(false);
    setPickerOpen(false);
  }

  async function resumeConversation(id) {
    if (abortRef.current) abortRef.current.abort();
    setSessionId(id);
    setError('');
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
    attachment,
    setAttachment,
    streaming,
    error,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    send,
    stop,
    startNewConversation,
    resumeConversation,
    openPicker,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
