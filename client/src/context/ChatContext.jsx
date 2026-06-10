import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiStream, apiStreamGet, apiUpload } from '../api/client';
import { createSseParser } from '../components/chat/sseParser';
import { getModel, setModel as persistModel } from '../components/chat/ModelSelector';
import { useDock } from './DockContext';
import { useRepo } from './RepoContext';
import { useT } from '../i18n/LanguageContext';

// Holds per-tab chat conversations. Each Dock tab gets its own independent
// conversation state (messages, sessionId, streaming, draft, etc.). The active
// tab's state is surfaced through useChat() so existing consumers (Chat page,
// ChatInput) work without changes.
//
// When no Dock tabs exist, a "default" conversation keyed by the global repo
// selector is used, preserving the pre-Dock single-conversation experience.
const ChatContext = createContext(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a <ChatProvider>');
  return ctx;
}

function emptyConversation(greeting) {
  return {
    messages: [greeting],
    sessionId: null,
    draft: '',
    attachment: null,
    streaming: false,
    error: '',
    contextTokens: null,
  };
}

export function ChatProvider({ children }) {
  const { t } = useT();
  const { currentRepoId } = useRepo();
  const { tabs, activeTab, activeTabId, updateTab, loaded: dockLoaded } = useDock();
  const greeting = () => ({ role: 'assistant', text: t('chat.greeting') });

  // Per-tab conversation map: tabId -> conversation state.
  // "default" key is used when no Dock tabs exist.
  const [convos, setConvos] = useState(() => ({
    default: emptyConversation(greeting()),
  }));

  // Per-tab abort controllers (not in React state — refs to avoid re-renders).
  const abortRefs = useRef({});
  // Highest event seq seen per conversation. The backend tags every SSE event
  // with a seq so a reattach (GET /api/chat/stream?after=N) never duplicates
  // or misses events (see plans/detached-runs.md).
  const seqRefs = useRef({});
  // Set while the user explicitly stopped a run, so reattach logic stands down.
  const stopRefs = useRef({});

  const [model, setModelState] = useState(getModel);
  const changeModel = useCallback((id) => { persistModel(id); setModelState(id); }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  // Determine which conversation key is active.
  const activeKey = activeTabId || 'default';
  // The repo to target for API calls.
  const activeRepoId = activeTab ? activeTab.repoId : currentRepoId;

  // Ensure a conversation entry exists for the active key. If the tab was
  // restored from localStorage with a stored sessionId (page reload), resume
  // it: seed the sessionId so the next send() uses --resume, and load the
  // transcript.
  useEffect(() => {
    if (convos[activeKey]) return;
    // Tabs arrive async from the backend (plans/dock-sync.md): wait for the
    // dock before seeding a tab conversation, so the tab's stored sessionId
    // is actually known here.
    if (activeKey !== 'default' && !dockLoaded) return;
    const storedSessionId = activeTab?.sessionId || null;
    setConvos((prev) => {
      if (prev[activeKey]) return prev;
      const fresh = emptyConversation(greeting());
      if (storedSessionId) {
        fresh.sessionId = storedSessionId;
        fresh.messages = [{ role: 'assistant', text: t('chat.loadingConversation') }];
      }
      return { ...prev, [activeKey]: fresh };
    });
    if (storedSessionId) loadTranscript(activeKey, storedSessionId, activeTab.repoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, dockLoaded]);

  // When the global repo changes and we're in default mode (no Dock tabs),
  // reset the default conversation.
  const prevRepoRef = useRef(currentRepoId);
  useEffect(() => {
    if (activeTabId) return; // Dock tabs manage their own repos.
    if (prevRepoRef.current === currentRepoId) return;
    prevRepoRef.current = currentRepoId;
    resetConversation('default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRepoId, activeTabId]);

  // Get the current conversation (safe fallback).
  const conv = convos[activeKey] || emptyConversation(greeting());

  // Update a specific conversation's state.
  const updateConvo = useCallback((key, updater) => {
    setConvos((prev) => {
      const current = prev[key];
      if (!current) return prev;
      const updated = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      return { ...prev, [key]: updated };
    });
  }, []);

  // Update the last assistant message in a specific conversation.
  const updateAssistant = useCallback((key, updater) => {
    updateConvo(key, (c) => {
      const msgs = c.messages.slice();
      const i = msgs.length - 1;
      if (i >= 0 && msgs[i].role === 'assistant') msgs[i] = updater(msgs[i]);
      return { ...c, messages: msgs };
    });
  }, [updateConvo]);

  const appendToken = useCallback(
    (key, text) => updateAssistant(key, (m) => ({ ...m, text: m.text + text })),
    [updateAssistant],
  );

  const addThinking = useCallback(
    (key, text) =>
      updateAssistant(key, (m) => {
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
    (key, evt) =>
      updateAssistant(key, (m) => {
        const steps = (m.steps || []).slice();
        let idx = evt.id ? steps.findIndex((s) => s.kind === 'tool' && s.id === evt.id) : -1;

        if (evt.status === 'start' || evt.status === 'input') {
          if (idx === -1) {
            steps.push({
              kind: 'tool', id: evt.id, name: evt.name || 'tool',
              status: 'running', startedAt: Date.now(),
              summary: evt.summary || '', detail: evt.detail || '', preview: '',
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
          if (idx === -1) {
            for (let j = steps.length - 1; j >= 0; j--) {
              if (steps[j].kind === 'tool' && steps[j].status === 'running') { idx = j; break; }
            }
          }
          if (idx !== -1) {
            steps[idx] = {
              ...steps[idx], status: evt.ok === false ? 'error' : 'done',
              ok: evt.ok !== false, preview: evt.preview || '',
            };
          }
        }
        return { ...m, steps };
      }),
    [updateAssistant],
  );

  function makeEventHandler(key, tabId) {
    return function handleEvent(evt) {
      // Dedup across reattaches: skip anything we already applied.
      if (evt.seq != null) {
        if (evt.seq <= (seqRefs.current[key] || 0)) return;
        seqRefs.current[key] = evt.seq;
      }
      switch (evt.type) {
        case 'session':
          if (evt.sessionId) {
            updateConvo(key, { sessionId: evt.sessionId });
            if (tabId) updateTab(tabId, { sessionId: evt.sessionId });
          }
          break;
        case 'thinking':
          addThinking(key, evt.text);
          break;
        case 'tool':
          handleTool(key, evt);
          break;
        case 'token':
          if (evt.text) appendToken(key, evt.text);
          break;
        case 'usage':
          // Raw context size in tokens for the ctx pill (plans/context-meter.md).
          if (evt.contextTokens > 0) updateConvo(key, { contextTokens: evt.contextTokens });
          break;
        case 'done':
          if (evt.sessionId) {
            updateConvo(key, { sessionId: evt.sessionId });
            if (tabId) updateTab(tabId, { sessionId: evt.sessionId, status: 'done' });
          }
          break;
        case 'error':
          updateConvo(key, { error: evt.message || t('chat.genericError') });
          if (tabId) updateTab(tabId, { status: 'error' });
          break;
        default:
          break;
      }
    };
  }

  async function send(text) {
    const key = activeKey;
    const tabId = activeTabId;
    const repoId = activeRepoId;

    updateConvo(key, { error: '' });
    const pendingFile = conv.attachment;
    updateConvo(key, { draft: '', attachment: null });

    let fullText = text;
    if (pendingFile) {
      try {
        const result = await apiUpload('/upload', pendingFile, { repoId });
        const suffix = `\n\n[Attached file: ${result.path}]`;
        fullText = text ? text + suffix : suffix;
      } catch {
        updateConvo(key, { error: t('chat.uploadError'), draft: text });
        return;
      }
    }

    updateConvo(key, (c) => ({
      ...c,
      messages: [...c.messages, { role: 'user', text: fullText }, { role: 'assistant', text: '', steps: [] }],
      streaming: true,
    }));
    if (tabId) updateTab(tabId, { status: 'running' });

    const controller = new AbortController();
    abortRefs.current[key] = controller;
    // New turn = new run = new event buffer. Reset the dedup watermark or the
    // new run's low seq numbers get discarded as replays of the previous turn.
    seqRefs.current[key] = 0;
    const handleEvent = makeEventHandler(key, tabId);
    const parse = createSseParser(handleEvent);

    try {
      const body = { message: fullText, model };
      const currentConvo = convos[key] || conv;
      if (currentConvo.sessionId) body.sessionId = currentConvo.sessionId;
      await apiStream('/chat', body, parse, { signal: controller.signal, repoId });
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stop or tab close — nothing to recover.
      } else if (err.status === undefined) {
        // Connection lost (screen lock, network drop) — the backend run is
        // still alive. Reattach instead of declaring failure.
        const recovered = await streamRun(key, tabId, repoId);
        if (!recovered && !stopRefs.current[key]) {
          updateConvo(key, { error: t('chat.sendError') });
          if (tabId) updateTab(tabId, { status: 'error' });
        }
      } else {
        // Real HTTP error from the backend (400/409/...).
        updateConvo(key, { error: t('chat.sendError') });
        if (tabId) updateTab(tabId, { status: 'error' });
      }
    } finally {
      finishStream(key);
      delete abortRefs.current[key];
      delete stopRefs.current[key];
    }
  }

  // Close out a conversation's streaming state: drop an untouched assistant
  // bubble, settle any tool steps left "running", clear the streaming flag.
  function finishStream(key) {
    updateConvo(key, (c) => {
      const msgs = c.messages.slice();
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        if (last.text === '' && (!last.steps || last.steps.length === 0)) {
          return { ...c, streaming: false, messages: msgs.slice(0, -1) };
        }
        if (last.steps?.some((s) => s.kind === 'tool' && s.status === 'running')) {
          msgs[msgs.length - 1] = {
            ...last,
            steps: last.steps.map((s) =>
              s.kind === 'tool' && s.status === 'running' ? { ...s, status: 'done' } : s,
            ),
          };
        }
      }
      return { ...c, streaming: false, messages: msgs };
    });
  }

  // Attach (or reattach) to the backend run for a repo, resuming after the
  // last seq we saw. Retries transient failures; gives up on 404 (no run).
  // Returns true when the stream ended normally or the user stopped it.
  async function streamRun(key, tabId, repoId, attempts = 5) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      if (stopRefs.current[key]) return true;
      const controller = new AbortController();
      abortRefs.current[key] = controller;
      const parse = createSseParser(makeEventHandler(key, tabId));
      try {
        const after = seqRefs.current[key] || 0;
        await apiStreamGet(`/chat/stream?after=${after}`, parse, {
          signal: controller.signal, repoId,
        });
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return true;
        if (err.status === 404) return false; // no run on the backend
        // transient — retry
      } finally {
        if (abortRefs.current[key] === controller) delete abortRefs.current[key];
      }
    }
    return false;
  }

  // Reattach a conversation that has no live reader to its backend run
  // (after a page reload or phone unlock).
  async function attachToRun(key, tabId, repoId, run) {
    if (abortRefs.current[key]) return;

    const existing = convos[key];
    const fresh = !existing || existing.messages.length <= 1;
    if (!existing) {
      setConvos((prev) => (prev[key] ? prev : { ...prev, [key]: emptyConversation(greeting()) }));
    }
    if (tabId) {
      updateTab(tabId, {
        status: 'running',
        ...(run?.sessionId ? { sessionId: run.sessionId } : {}),
      });
    }
    // A fresh conversation (page reload) has lost the turn's messages: pull
    // the transcript from disk first so the user's prompt is visible, then
    // let the replay stream the in-progress answer on top of it.
    if (fresh && run?.sessionId) {
      await loadTranscript(key, run.sessionId, repoId);
      updateConvo(key, { sessionId: run.sessionId });
    }

    updateConvo(key, (c) => {
      const msgs = c.messages.slice();
      const last = msgs[msgs.length - 1];
      if (!(c.streaming && last && last.role === 'assistant')) {
        msgs.push({ role: 'assistant', text: '', steps: [] });
      }
      return { ...c, messages: msgs, streaming: true, error: '' };
    });
    const recovered = await streamRun(key, tabId, repoId);
    finishStream(key);
    if (!recovered && !stopRefs.current[key]) {
      updateConvo(key, { error: t('chat.sendError') });
      if (tabId) updateTab(tabId, { status: 'error' });
    }
    delete stopRefs.current[key];
  }

  // Reconcile local state with backend runs: on load and whenever the page
  // becomes visible again (phone unlock), ask GET /api/runs which repos are
  // still running and reattach / fix stale tab badges.
  async function reconcile() {
    // The dock list now arrives from the backend; until it lands we don't
    // know which tabs exist, so reconciling would mis-target 'default'.
    if (!dockLoaded) return;
    let runs;
    try {
      runs = await apiGet('/runs');
    } catch {
      return;
    }
    const targets = tabs.length > 0
      ? tabs.map((tab) => ({ key: tab.id, tabId: tab.id, repoId: tab.repoId, tab }))
      : [{ key: 'default', tabId: null, repoId: currentRepoId, tab: null }];
    for (const { key, tabId, repoId, tab } of targets) {
      const run = runs?.[repoId];
      if (run?.status === 'running') {
        attachToRun(key, tabId, repoId, run);
      } else if (tab && tab.status === 'running' && !abortRefs.current[key]) {
        // The run finished while no client was attached (page was closed):
        // fix the badge and restore the finished turn from the transcript.
        updateTab(tabId, {
          status: run ? run.status : 'idle',
          ...(run?.sessionId ? { sessionId: run.sessionId } : {}),
        });
        if (run?.sessionId) {
          const c = convos[key];
          if (!c || c.messages.length <= 1) {
            setConvos((prev) => (prev[key] ? prev : { ...prev, [key]: emptyConversation(greeting()) }));
            loadTranscript(key, run.sessionId, repoId);
            updateConvo(key, { sessionId: run.sessionId });
          }
        }
      }
    }
  }

  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  useEffect(() => {
    reconcileRef.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconcileRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  // First reconcile happens once the backend dock list has loaded.
  useEffect(() => {
    if (dockLoaded) reconcileRef.current();
  }, [dockLoaded]);

  const stop = useCallback(() => {
    const key = activeKey;
    stopRefs.current[key] = true;
    abortRefs.current[key]?.abort();
    // The run is backend-owned now: aborting the local stream detaches us but
    // leaves the CLI working, so an explicit stop call is required.
    apiPost('/chat/stop', undefined, { repoId: activeRepoId }).catch(() => {});
    if (activeTabId) updateTab(activeTabId, { status: 'idle' });
  }, [activeKey, activeRepoId, activeTabId, updateTab]);

  function resetConversation(key) {
    const controller = abortRefs.current[key];
    if (controller) controller.abort();
    seqRefs.current[key] = 0;
    delete stopRefs.current[key];
    setConvos((prev) => ({
      ...prev,
      [key]: emptyConversation(greeting()),
    }));
    setPickerOpen(false);
  }

  function startNewConversation() {
    resetConversation(activeKey);
    if (activeTabId) updateTab(activeTabId, { sessionId: null, status: 'idle' });
  }

  async function resumeConversation(id) {
    const key = activeKey;
    const repoId = activeRepoId;
    const controller = abortRefs.current[key];
    if (controller) controller.abort();
    seqRefs.current[key] = 0;

    updateConvo(key, {
      sessionId: id, error: '', streaming: false,
      messages: [{ role: 'assistant', text: t('chat.loadingConversation') }],
    });
    setPickerOpen(false);
    if (activeTabId) updateTab(activeTabId, { sessionId: id, status: 'idle' });
    await loadTranscript(key, id, repoId);
  }

  async function loadTranscript(key, id, repoId) {
    try {
      const data = await apiGet(`/sessions/${id}/messages`, { repoId });
      const loaded = Array.isArray(data)
        ? data.map((m) => ({ role: m.role, text: m.text }))
        : [];
      updateConvo(key, {
        messages: loaded.length > 0
          ? loaded
          : [greeting(), { role: 'assistant', text: t('chat.resumed') }],
      });
    } catch {
      updateConvo(key, { error: t('chat.resumeError'), messages: [greeting()] });
    }
  }

  async function openPicker() {
    setPickerOpen(true);
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const data = await apiGet('/sessions', { repoId: activeRepoId });
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  }

  // Clean up when an agent tab is closed: abort any in-flight stream and
  // drop its conversation entry.
  useEffect(() => {
    // Until the backend dock list lands, tabs=[] means "unknown", not "all
    // closed" — deleting here would wipe the active tab's conversation.
    if (!dockLoaded) return;
    const live = new Set(tabs.map((tab) => tab.id));
    const stale = Object.keys(convos).filter((k) => k !== 'default' && !live.has(k));
    if (stale.length === 0) return;
    for (const k of stale) {
      abortRefs.current[k]?.abort();
      delete abortRefs.current[k];
      delete seqRefs.current[k];
      delete stopRefs.current[k];
    }
    setConvos((prev) => {
      const next = { ...prev };
      for (const k of stale) delete next[k];
      return next;
    });
  }, [tabs, convos, dockLoaded]);

  const value = {
    messages: conv.messages,
    sessionId: conv.sessionId,
    draft: conv.draft,
    setDraft: (d) => updateConvo(activeKey, { draft: d }),
    attachment: conv.attachment,
    setAttachment: (a) => updateConvo(activeKey, { attachment: a }),
    streaming: conv.streaming,
    error: conv.error,
    contextTokens: conv.contextTokens,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    model,
    changeModel,
    send,
    stop,
    startNewConversation,
    resumeConversation,
    openPicker,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
