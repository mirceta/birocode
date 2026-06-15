import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiStream, apiStreamGet, apiUpload } from '../api/client';
import { createSseParser } from '../components/chat/sseParser';
import { getModel, setModel as persistModel } from '../components/chat/ModelSelector';
import { useDock } from './DockContext';
import { useRepo } from './RepoContext';
import { useFeature } from './UiModeContext';
import { useT } from '../i18n/LanguageContext';

// Holds per-tab chat conversations. Each Dock tab gets its own independent
// conversation state (messages, sessionId, streaming, draft, etc.). The active
// tab's state is surfaced through useChat() so existing consumers (Chat page,
// ChatInput) work without changes.
//
// When no Dock tabs exist, a "default" conversation keyed by the global repo
// selector is used, preserving the pre-Dock single-conversation experience.
//
// Dual chat (plans/dual-chat.md): next to 'default' lives a second fixed
// conversation key, 'harness', permanently pinned to the self repo (Claude
// Web itself). Which surface is visible is the device-local chatView in
// DockContext: 'agent' (dock tab / plain default — the pre-dual behavior),
// 'project' (the project-following chat) or 'harness'.
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
  const { currentRepoId, repos } = useRepo();
  const { tabs, activeTab, activeTabId, updateTab, loaded: dockLoaded, chatView, setChatView } = useDock();
  const dualChat = useFeature('dualChat');
  // The harness's own repo — the backend pins it and flags it isSelf.
  const selfRepoId = repos.find((r) => r.isSelf)?.id || null;
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

  // Resolve which chat surface is visible. 'agent' is the pre-dual behavior
  // (active dock tab, else the plain default chat). The harness view degrades
  // to 'project' while repos are loading or when no self repo is registered.
  let view = dualChat ? chatView : 'agent';
  if (view === 'harness' && !selfRepoId) view = 'project';

  // Determine which conversation key is active, and the dock tab actually
  // backing it (null when a fixed Project/Claude Web chat is showing, so tab
  // status patches never hit a background agent).
  const visibleTab = view === 'agent' ? activeTab : null;
  const visibleTabId = view === 'agent' ? activeTabId : null;
  const activeKey =
    view === 'harness' ? 'harness'
      : view === 'ask' ? 'ask'
        : view === 'project' ? 'default' : activeTabId || 'default';
  // The repo to target for API calls. The Ask side conversation
  // (plans/repo-ask-chat.md) follows the active project, like the Project chat.
  const activeRepoId =
    view === 'harness' ? selfRepoId : visibleTab ? visibleTab.repoId : currentRepoId;
  // The run lane: the read-only "ask" lane can run concurrently with the
  // builder on the same repo; everything else is the full-capability builder.
  const activeLane = view === 'ask' ? 'ask' : 'builder';

  // A conversation "target" bundles the three things every chat action needs:
  // which conversation key, which repo to scope API calls to, and which dock
  // tab's badge to patch (null for the fixed Project/Claude Web chats). The
  // active target reproduces the pre-existing single-conversation behaviour;
  // useChatFor() (below) builds a target for a *background* agent so the Agent
  // Dashboard can render several agents' chats live at once (the "wall of
  // phones", plans/agent-dashboard.md). Every action takes an explicit target,
  // so a background phone never touches the active conversation.
  const activeTarget = { key: activeKey, repoId: activeRepoId, tabId: visibleTabId, lane: activeLane };

  // Ensure a conversation entry exists for the active key. If the tab was
  // restored from localStorage with a stored sessionId (page reload), resume
  // it: seed the sessionId so the next send() uses --resume, and load the
  // transcript.
  useEffect(() => {
    if (convos[activeKey]) return;
    // Tabs arrive async from the backend (plans/dock-sync.md): wait for the
    // dock before seeding a tab conversation, so the tab's stored sessionId
    // is actually known here. The fixed keys don't depend on the dock.
    if (activeKey !== 'default' && activeKey !== 'harness' && activeKey !== 'ask' && !dockLoaded) return;
    const storedSessionId = visibleTab?.sessionId || null;
    setConvos((prev) => {
      if (prev[activeKey]) return prev;
      const fresh = emptyConversation(greeting());
      if (storedSessionId) {
        fresh.sessionId = storedSessionId;
        fresh.messages = [{ role: 'assistant', text: t('chat.loadingConversation') }];
      }
      return { ...prev, [activeKey]: fresh };
    });
    if (storedSessionId) loadTranscript(activeKey, storedSessionId, visibleTab.repoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, dockLoaded]);

  // When the global repo changes, reset the project-following default
  // conversation. The harness chat is pinned and never resets here; an
  // active agent view means the switch came from agent-repo-sync — leave
  // the default chat alone, as before.
  const prevRepoRef = useRef(currentRepoId);
  useEffect(() => {
    if (view === 'agent' && activeTabId) return; // Dock tabs manage their own repos.
    if (prevRepoRef.current === currentRepoId) return;
    prevRepoRef.current = currentRepoId;
    resetConversation('default');
    // The Ask side conversation also follows the active project — start it
    // fresh for the new repo so its context isn't carried across projects.
    resetConversation('ask');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRepoId, activeTabId, view]);

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

  async function sendTo(text, { key, repoId, tabId, lane = 'builder' }) {
    updateConvo(key, { error: '' });
    const pendingFile = convos[key]?.attachment;
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
      const currentConvo = convos[key];
      if (currentConvo?.sessionId) body.sessionId = currentConvo.sessionId;
      if (lane && lane !== 'builder') body.lane = lane;
      await apiStream('/chat', body, parse, { signal: controller.signal, repoId });
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stop or tab close — nothing to recover.
      } else if (err.status === undefined) {
        // Connection lost (screen lock, network drop) — the backend run is
        // still alive. Reattach instead of declaring failure.
        const recovered = await streamRun(key, tabId, repoId, lane);
        if (!recovered && !stopRefs.current[key]) {
          updateConvo(key, { error: t('chat.sendError') });
          if (tabId) updateTab(tabId, { status: 'error' });
        }
      } else {
        // Real HTTP error from the backend. 409 = the repo's single run slot
        // is taken — with dual chat two conversations can share a repo, so
        // say which problem this is instead of a generic failure.
        const msg = err.status === 409 ? t('chat.busyError') : t('chat.sendError');
        updateConvo(key, { error: msg });
        if (tabId) updateTab(tabId, { status: 'error' });
      }
    } finally {
      finishStream(key);
      delete abortRefs.current[key];
      delete stopRefs.current[key];
    }
  }

  // Active-conversation send — the API existing consumers (Chat page) use.
  const send = (text) => sendTo(text, activeTarget);

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
  async function streamRun(key, tabId, repoId, lane = 'builder', attempts = 5) {
    const laneQs = lane && lane !== 'builder' ? `&lane=${lane}` : '';
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      if (stopRefs.current[key]) return true;
      const controller = new AbortController();
      abortRefs.current[key] = controller;
      const parse = createSseParser(makeEventHandler(key, tabId));
      try {
        const after = seqRefs.current[key] || 0;
        await apiStreamGet(`/chat/stream?after=${after}${laneQs}`, parse, {
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
  async function attachToRun(key, tabId, repoId, run, lane = 'builder') {
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
    const recovered = await streamRun(key, tabId, repoId, lane);
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
    let targets = tabs.length > 0
      ? tabs.map((tab) => ({ key: tab.id, tabId: tab.id, repoId: tab.repoId, tab, lane: 'builder' }))
      : [{ key: 'default', tabId: null, repoId: currentRepoId, tab: null, lane: 'builder' }];
    if (dualChat) {
      if (selfRepoId) targets.push({ key: 'harness', tabId: null, repoId: selfRepoId, tab: null, lane: 'builder' });
      // The read-only Ask side conversation (plans/repo-ask-chat.md) on its own
      // lane — its run is keyed repoId#ask, independent of the builder, so it
      // never collides with the dedup below.
      if (currentRepoId) targets.push({ key: 'ask', tabId: null, repoId: currentRepoId, tab: null, lane: 'ask' });
      // One BUILDER run per repo: when another builder conversation also targets
      // the self repo, only one may reattach. Prefer the one already carrying the
      // run's sessionId; otherwise the harness yields. (Ask is excluded — it's a
      // separate lane with its own run.)
      const shared = targets.filter((tg) => tg.repoId === selfRepoId && tg.lane !== 'ask');
      if (shared.length > 1) {
        const run = runs?.[selfRepoId];
        const match = run?.sessionId
          ? shared.find((tg) => convos[tg.key]?.sessionId === run.sessionId)
          : null;
        const keep = match || shared.find((tg) => tg.key !== 'harness');
        targets = targets.filter((tg) => tg.repoId !== selfRepoId || tg.lane === 'ask' || tg === keep);
      }
    }
    for (const { key, tabId, repoId, tab, lane = 'builder' } of targets) {
      const run = runs?.[lane === 'ask' ? `${repoId}#ask` : repoId];
      if (run?.status === 'running') {
        attachToRun(key, tabId, repoId, run, lane);
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

  // Refresh ONE docked conversation on demand (the dashboard dock's per-dock
  // chat-refresh button): a single-key version of reconcile(). Re-pull this
  // agent's latest state from the backend — reattach if its run is live and we
  // have no reader, otherwise fix a stale badge and re-fetch the transcript so
  // the dock shows the finished turn. A no-op while a live stream is already
  // attached (it's already delivering).
  async function refreshOne(key, tabId, repoId, sessionId) {
    let runs;
    try {
      runs = await apiGet('/runs');
    } catch {
      return;
    }
    const run = runs?.[repoId];
    if (run?.status === 'running') {
      if (!abortRefs.current[key]) attachToRun(key, tabId, repoId, run);
      return;
    }
    // Not running: correct a stale 'running' badge, then re-pull the transcript.
    if (tabId && run) {
      updateTab(tabId, {
        status: run.status || 'idle',
        ...(run.sessionId ? { sessionId: run.sessionId } : {}),
      });
    }
    const id = run?.sessionId || sessionId || convos[key]?.sessionId;
    if (id) {
      await loadTranscript(key, id, repoId);
      updateConvo(key, { sessionId: id });
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

  function stopTo({ key, repoId, tabId, lane = 'builder' }) {
    stopRefs.current[key] = true;
    abortRefs.current[key]?.abort();
    // The run is backend-owned now: aborting the local stream detaches us but
    // leaves the CLI working, so an explicit stop call is required. Stop the
    // matching lane so an ask stop never cancels the builder.
    const laneQs = lane && lane !== 'builder' ? `?lane=${lane}` : '';
    apiPost(`/chat/stop${laneQs}`, undefined, { repoId }).catch(() => {});
    if (tabId) updateTab(tabId, { status: 'idle' });
  }
  const stop = () => stopTo(activeTarget);

  function resetConversation(key) {
    const controller = abortRefs.current[key];
    if (controller) controller.abort();
    seqRefs.current[key] = 0;
    delete stopRefs.current[key];
    setConvos((prev) => ({
      ...prev,
      [key]: emptyConversation(greeting()),
    }));
  }

  function startNewIn({ key, tabId }) {
    resetConversation(key);
    if (tabId) updateTab(tabId, { sessionId: null, status: 'idle' });
  }
  const startNewConversation = () => {
    setPickerOpen(false);
    startNewIn(activeTarget);
  };

  async function resumeIn(id, { key, repoId, tabId }) {
    const controller = abortRefs.current[key];
    if (controller) controller.abort();
    seqRefs.current[key] = 0;

    updateConvo(key, {
      sessionId: id, error: '', streaming: false,
      messages: [{ role: 'assistant', text: t('chat.loadingConversation') }],
    });
    if (tabId) updateTab(tabId, { sessionId: id, status: 'idle' });
    await loadTranscript(key, id, repoId);
  }
  const resumeConversation = (id) => {
    setPickerOpen(false);
    return resumeIn(id, activeTarget);
  };

  // Seed a background conversation (a dashboard phone for an agent that isn't
  // the active tab). Running agents are already seeded by reconcile(); this
  // covers idle agents whose transcript the active-tab effect hasn't loaded.
  // Idempotent: skips if the conversation exists, and only requests each
  // transcript once (a ref watermark, since setConvos's guard runs async).
  const transcriptRequested = useRef(new Set());
  function seedConvo(key, repoId, sessionId) {
    setConvos((prev) => {
      if (prev[key]) return prev;
      const fresh = emptyConversation(greeting());
      if (sessionId) {
        fresh.sessionId = sessionId;
        fresh.messages = [{ role: 'assistant', text: t('chat.loadingConversation') }];
      }
      return { ...prev, [key]: fresh };
    });
    if (sessionId && !transcriptRequested.current.has(key)) {
      transcriptRequested.current.add(key);
      loadTranscript(key, sessionId, repoId);
    }
  }

  // Fetch a repo's saved sessions for a session picker, scoped to that repo
  // (used by the active picker and by each dashboard phone's own picker).
  async function loadSessionsFor(repoId) {
    const data = await apiGet('/sessions', { repoId });
    return Array.isArray(data) ? data : [];
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
      setSessions(await loadSessionsFor(activeRepoId));
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
    const stale = Object.keys(convos).filter(
      (k) => k !== 'default' && k !== 'harness' && k !== 'ask' && !live.has(k),
    );
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
    // Dual chat (plans/dual-chat.md): the resolved surface, the device-local
    // selector, and whether a self repo exists to pin the harness chat to.
    chatView: view,
    setChatView,
    hasSelfRepo: !!selfRepoId,
    // Drop text into the PROJECT chat's composer and switch to it (the Exposure
    // check's "Fix with an agent", plans/product-onboarding.md). Targets the
    // 'default' conversation explicitly so it lands on the project chat
    // regardless of the current view.
    prefillProjectChat: (text) => {
      updateConvo('default', { draft: text });
      setChatView('project');
    },
    // Per-key primitives for background conversations (the Agent Dashboard's
    // wall of phones). useChatFor() composes these into a facade shaped like
    // the active value above, but bound to a specific agent's target.
    convos,
    updateConvo,
    seedConvo,
    loadSessionsFor,
    sendTo,
    stopTo,
    startNewIn,
    resumeIn,
    refreshOne,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// Read + drive ONE agent's conversation by key, regardless of which tab is
// active. The Agent Dashboard renders several of these at once — each a
// "phone" showing one agent's live chat (plans/agent-dashboard.md). The
// returned object matches the shape <Chat> consumes, so the same view renders
// either the active conversation (useChat) or a background one (useChatFor).
//
// All API calls are scoped to `repoId`, so a background phone never reads or
// writes another agent's repo. The session picker state is kept LOCAL here so
// each phone has its own, rather than sharing the provider's single picker.
export function useChatFor({ key, repoId, tabId, sessionId }) {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatFor must be used within a <ChatProvider>');
  const { t } = useT();
  const greeting = useMemo(() => ({ role: 'assistant', text: t('chat.greeting') }), [t]);

  // Seed this conversation once (idle agents reconcile() didn't attach). The
  // provider guards against clobbering an existing/running conversation.
  useEffect(() => {
    ctx.seedConvo(key, repoId, sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, repoId, sessionId]);

  const conv = ctx.convos[key] || {
    messages: [greeting], sessionId: null, draft: '', attachment: null,
    streaming: false, error: '', contextTokens: null,
  };

  const target = useMemo(() => ({ key, repoId, tabId }), [key, repoId, tabId]);

  // This phone's own session picker (not the provider's shared one).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const openPicker = async () => {
    setPickerOpen(true);
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      setSessions(await ctx.loadSessionsFor(repoId));
    } catch {
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  };

  return {
    messages: conv.messages,
    sessionId: conv.sessionId,
    draft: conv.draft,
    setDraft: (d) => ctx.updateConvo(key, { draft: d }),
    attachment: conv.attachment,
    setAttachment: (a) => ctx.updateConvo(key, { attachment: a }),
    streaming: conv.streaming,
    error: conv.error,
    contextTokens: conv.contextTokens,
    model: ctx.model,
    changeModel: ctx.changeModel,
    send: (text) => ctx.sendTo(text, target),
    stop: () => ctx.stopTo(target),
    refresh: () => ctx.refreshOne(key, tabId, repoId, sessionId),
    startNewConversation: () => {
      setPickerOpen(false);
      ctx.startNewIn(target);
    },
    resumeConversation: (id) => {
      setPickerOpen(false);
      ctx.resumeIn(id, target);
    },
    openPicker,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    // A per-agent phone has no project/harness scope selector.
    chatView: 'agent',
    setChatView: () => {},
    hasSelfRepo: false,
  };
}
