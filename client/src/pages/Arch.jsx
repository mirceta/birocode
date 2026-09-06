import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import { useFeature } from '../context/UiModeContext';
import { useDock } from '../context/DockContext';
import MessageBubble from '../components/chat/MessageBubble';
import ActivitySteps from '../components/chat/ActivitySteps';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ArchToolsPanel from '../components/arch/ArchToolsPanel';
import ArchHistoryPanel from '../components/arch/ArchHistoryPanel';
import useArchStream from '../hooks/useArchStream';
import DockLoopControl from '../components/dashboard/DockLoopControl';
import '../components/chat/chat.css';
import './dashboard.css'; // the dock loop control's styles (openspec arch-driven-loops)
import './arch.css';

// The Arch tab (openspec: add-arch-agent, D9): the arch agent's own surface.
// Left: its conversation (operator messages, arch replies, harness wake-ups
// rendered as wake bubbles). Right: the managed-agents strip (availability,
// branch, last actor, elapsed, open-dock), the scope picker, the loop header
// (arm / suggest|drive / cap / Stop) and the home repo. State and the settled
// transcript read from GET /api/arch on a short poll; the CURRENT turn is live
// (task 6c): useArchStream attaches to the @arch run and the page renders its
// thinking / tool steps / streamed reply with the repo chat's own components,
// then hands over to the transcript once it carries the reply.

// The live turn and the polled transcript describe the same conversation, so
// the page shows each turn once: the transcript is cut at the live turn's own
// user message (the CLI writes the transcript as the turn goes), and a settled
// live turn is dropped only once the transcript holds a reply after that
// message — a reply the CLI never persisted stays on screen until the next
// turn starts. The running turn is always the transcript's LAST user message,
// so only that one is compared (a repeated prompt earlier on is not a match).
function splitLive(messages, turn) {
  if (!turn) return { visible: messages, persisted: false };
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { idx = i; break; }
  }
  const matches = idx !== -1 && !!turn.user && messages[idx].text === turn.user.text;
  if (!matches) {
    // No user event in the live turn: the transcript's trailing reply is the
    // only way to tell it has been persisted.
    const last = messages[messages.length - 1];
    const sameReply = !turn.user && !!last && last.role === 'assistant'
      && !!last.text && last.text.trim() === turn.assistant.text.trim();
    return { visible: sameReply ? messages.slice(0, -1) : messages, persisted: sameReply };
  }
  const persisted = messages.slice(idx + 1).some((m) => m.role === 'assistant' && m.text);
  return { visible: messages.slice(0, idx), persisted };
}

const POLL_MS = 3000;
// Side column (openspec arch-side-column): its width and visibility persist per
// device; the same cards also live in the Fleet lane, full width.
const SIDE_WIDTH_KEY = 'arch.sideWidth';
const SIDE_OPEN_KEY = 'arch.sideOpen';
const SIDE_MIN = 240;
const readSideWidth = () => { try { const n = Number(localStorage.getItem(SIDE_WIDTH_KEY)); return n >= SIDE_MIN ? n : 340; } catch { return 340; } };
const readSideOpen = () => { try { return localStorage.getItem(SIDE_OPEN_KEY) !== '0'; } catch { return true; } };
// Nested side-by-side inside the Arch tab (openspec arch-conversations): which lanes
// are shown as columns when the split is on. Per device, like the side column.
const SPLIT_KEY = 'arch.split';
const SPLIT_LANES_KEY = 'arch.splitLanes';
const LANES = ['chat', 'tools', 'history', 'loops', 'fleet'];
const readSplit = () => { try { return localStorage.getItem(SPLIT_KEY) === '1'; } catch { return false; } };
const readSplitLanes = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SPLIT_LANES_KEY));
    const clean = Array.isArray(v) ? v.filter((l) => LANES.includes(l)) : [];
    return clean.length ? clean : ['chat', 'history'];
  } catch { return ['chat', 'history']; }
};
const saveLocal = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } };
const AVAIL_CLASS = { available: 'ok', busy: 'busy', claimed: 'claimed', unmanaged: 'dim' };

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// `popup`: rendered inside the dashboard's pop-up frame (desktop) — the frame
// owns the title + ×, so the page drops its own title row; "open dock" then
// closes the dashboard via `onOpenDock` instead of navigating (the docks are
// already underneath).
// `view` (openspec fleet-status-tab, arch cards on Status): 'full' = the whole
// surface (studio); 'chat' = the conversation and its lanes only — no side
// column, no Fleet lane (the Management App's Arch tab); 'cards' = only the
// Loop / Managed agents / Fleet / Home repo cards as a grid (the Management
// App's Status tab hosts them under the fleet strips).
// `conv` (openspec arch-conversations): which arch conversation this page shows —
// the default `@arch` or `@arch:<id>`. Every conversation has its own loop slot,
// session and watermark; the scope, the fleet and the home repo are shared.
// `onConversationChanged` tells the host (the Management App's tab strip) that
// this conversation was renamed or removed.
export default function Arch({ popup = false, onOpenDock = null, view = 'full', conv = '@arch', onConversationChanged = null }) {
  const enabled = useFeature('archTab');
  const [state, setState] = useState(null);
  const convQ = conv && conv !== '@arch' ? `?conv=${encodeURIComponent(conv)}` : '';
  const [nameDraft, setNameDraft] = useState('');
  // The @arch row of the ungated loop projection + the recipe list (openspec
  // arch-driven-loops): what the dock loop control needs to arm a goal/recipe here.
  const [driven, setDriven] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [quietMin, setQuietMin] = useState(5);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeDraft, setScopeDraft] = useState([]);
  // Managed agents on OTHER harnesses (openspec: add-fleet-arch-agent), as
  // keys "sourceId/repoId" — the same shape the server persists.
  const [fleetDraft, setFleetDraft] = useState([]);
  const [cap, setCap] = useState(0); // 0 = no cap (openspec arch-standing-loop)
  const [mode, setMode] = useState('drive');
  // Goal conversations (openspec arch-goal-conversations): the start form on the Loops
  // lane, and the queued-message composer a busy goal conversation shows instead of Send.
  const [goalText, setGoalText] = useState('');
  const [goalRepos, setGoalRepos] = useState([]);
  const [goalTasks, setGoalTasks] = useState([]);
  const [goalCap, setGoalCap] = useState(20);
  const [boardTasks, setBoardTasks] = useState(null);
  const [goalNote, setGoalNote] = useState('');
  const [queueNote, setQueueNote] = useState('');
  // Lanes, like a repo dock's Builder | Ask | … row — the arch agent has three:
  // the conversation, its Tools (the harness MCP surface) and the History of
  // its tool calls. Chat is the default; the lane is view state, not persisted.
  const [lane, setLane] = useState('chat');
  const [split, setSplit] = useState(readSplit);
  const [splitLanes, setSplitLanes] = useState(readSplitLanes);
  const [sideWidth, setSideWidth] = useState(readSideWidth);
  const [sideOpen, setSideOpen] = useState(readSideOpen);
  const [sideDrag, setSideDrag] = useState(false);
  const colsRef = useRef(null);
  const [, setTick] = useState(0);
  const scrollRef = useRef(null);
  const alive = useRef(true);
  const { setActiveTab } = useDock();
  const navigate = useNavigate();

  // The transcript is polled only while the Chat lane shows it (openspec:
  // reduce-transcript-io, D2); the other lanes get the session id from the
  // state reply. laneRef keeps `load` stable across lane switches.
  const laneRef = useRef(lane);
  laneRef.current = lane;
  const splitRef = useRef({ split, splitLanes });
  splitRef.current = { split, splitLanes };
  const load = useCallback(async () => {
    try {
      const s = await apiGet(`/arch${convQ}`);
      if (!alive.current) return;
      setState(s);
      if (s?.conversation?.name !== undefined) setNameDraft((d) => (document.activeElement?.dataset?.convName !== undefined ? d : s.conversation.name));
      if (s?.loop?.sessionId) setSessionId(s.loop.sessionId);
      if (typeof s?.drivenQuietSeconds === 'number') setQuietMin((q) => (document.activeElement?.dataset?.quietFloor !== undefined ? q : Math.max(1, Math.round(s.drivenQuietSeconds / 60))));
      try {
        const li = await apiGet('/autopilot/loops');
        if (!alive.current) return;
        setDriven((li?.loops || []).find((l) => l.repoId === conv) || null);
        setRecipes(li?.recipes || []);
      } catch {
        /* the projection is optional here */
      }
      const chatShown = laneRef.current === 'chat' || (splitRef.current.split && splitRef.current.splitLanes.includes('chat'));
      if (!chatShown) { setError(''); return; }
      const m = await apiGet(`/arch/messages${convQ}`);
      if (!alive.current) return;
      setSessionId(m.sessionId);
      setMessages(m.messages || []);
      setError('');
    } catch (e) {
      if (alive.current) setError(e?.message || String(e));
    }
  }, [conv, convQ]);

  // The live turn: when its stream ends, re-pull the transcript at once so the
  // hand-over (settled live turn -> persisted reply) does not wait for the poll.
  const stream = useArchStream({ onEnded: load, repoId: conv, streamPath: `/arch/stream${convQ}` });
  const { turn } = stream;

  // "Copy agent prompt" (openspec arch-context-prompt): hand any repo agent on
  // this machine a self-contained pointer to THIS conversation, so "look at what
  // I told the arch agent" needs no tribal knowledge. The transcript file needs
  // no credentials; the API route is the fallback and never embeds the password.
  const [copiedCtx, setCopiedCtx] = useState(false);
  const copyAgentPrompt = useCallback(async () => {
    const sid = state?.session?.sessionId || sessionId || '(never armed — no session yet)';
    const path = state?.session?.transcriptPath || '(no transcript yet — the arch agent has not been armed on this box)';
    const origin = window.location.origin;
    const text = [
      'Context: how to read the Arch agent’s conversation on this machine (Claude Web harness).',
      '',
      `This harness hosts an orchestrating "arch agent" that supervises the repo agents. When the operator refers to "the arch conversation" or "what I told the arch agent", they mean this session:`,
      '',
      `- Arch session id: ${sid}`,
      `- Transcript on disk (readable directly, no credentials): ${path}`,
      '  JSONL, one message per line; read the tail for the latest exchanges. User lines carrying an actor tag (arch, wake, loop) are harness-driven, not the human.',
      `- Same conversation over the harness API (send header X-Auth-Password: <the harness access code — ask the operator, never guess>):`,
      `  GET ${origin}/api/arch/messages    the conversation`,
      `  GET ${origin}/api/arch/tool-calls  its tool calls (send_task, read_transcript, …)`,
      `  GET ${origin}/api/arch             loop / scope / fleet state`,
      '',
      'Prefer the transcript file; fall back to the API if the file is missing.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be unavailable over plain HTTP on the LAN: legacy path.
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopiedCtx(true);
    setTimeout(() => setCopiedCtx(false), 1500);
  }, [state, sessionId]);

  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    load();
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { alive.current = false; clearInterval(t); clearInterval(tick); };
  }, [enabled, load]);
  // Switching back to the Chat lane re-pulls the transcript at once.
  useEffect(() => {
    if (enabled && (lane === 'chat' || (split && splitLanes.includes('chat')))) load();
  }, [enabled, lane, split, splitLanes, load]);

  // Attach whenever the server has a running arch turn with events this page
  // has not consumed — page load, a reload mid-turn, a loop-driven wake, an
  // arch-eval send (the run's `user` event puts its seq ahead at once). The
  // seq test is what makes a stale "running" read during hand-over harmless:
  // the run this page just finished reading is not ahead of it, so a settled
  // copy is never replaced by an empty one. A seq that went backwards means
  // the harness restarted.
  const run = state?.session?.run;
  useEffect(() => {
    if (!run) return;
    stream.noteServerSeq(run.lastSeq);
    if (run.status !== 'running' || stream.attached() || !stream.behind(run.lastSeq)) return;
    stream.attach();
  }, [run, stream]);

  const { visible, persisted } = splitLive(messages, turn);

  // Hand-over: the transcript now carries the settled turn's reply.
  useEffect(() => {
    if (turn && !turn.active && persisted) stream.discard();
  }, [turn, persisted, stream]);

  const liveLen = turn ? turn.assistant.text.length + turn.assistant.steps.length : 0;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, liveLen]);

  // Suggest mode: the engine's pending wake prompt pre-fills the composer.
  const pending = state?.loop?.pendingPrompt || '';
  useEffect(() => {
    if (pending && !draft) setDraft(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const running = state?.session?.run?.status === 'running';
  const loop = state?.loop;
  const armed = !!loop?.active;
  // The reserved slot may hold a goal/recipe instead of the wake kind (openspec arch-driven-loops).
  const drivenArmed = armed && !!loop?.kind && loop.kind !== 'arch';
  const standingArmed = armed && (!loop?.kind || loop.kind === 'arch');

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await apiPost(`/arch/send${convQ}`, { text });
      setDraft('');
      setError('');
      // The user bubble comes from the run's own `user` event (the harness
      // emits it for every arch send), never drawn locally — one source.
      stream.attach();
      setTimeout(load, 800);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [draft, load, stream, convQ]);

  const loopAction = useCallback(async (body) => {
    try {
      const s = await apiPost(`/arch/loop${convQ}`, body);
      setState(s);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [convQ]);

  // Conversation name (openspec arch-conversations): editable at the top; saved on
  // blur / Enter; the host's tab strip is told so its label follows.
  const renameConversation = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name || name === state?.conversation?.name) { setNameDraft(state?.conversation?.name || ''); return; }
    try {
      const r = await apiPatch(`/arch/conversations/${encodeURIComponent(conv)}`, { name });
      setState((st) => (st ? { ...st, conversation: r.conversation } : st));
      setNameDraft(r.conversation?.name || name);
      setError('');
      onConversationChanged?.({ id: conv, name: r.conversation?.name || name });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [nameDraft, state, conv, onConversationChanged]);

  const removeConversation = useCallback(async () => {
    if (!window.confirm(`Remove the arch conversation "${state?.conversation?.name || conv}"? Its loop is stopped; the transcript stays on disk.`)) return;
    try {
      await apiDelete(`/arch/conversations/${encodeURIComponent(conv)}`);
      onConversationChanged?.({ id: conv, removed: true });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [state, conv, onConversationChanged]);

  const toggleSplit = useCallback(() => {
    setSplit((v) => { saveLocal(SPLIT_KEY, v ? '0' : '1'); return !v; });
  }, []);
  // With the split on, a lane chip toggles that lane's column (at least one, at most
  // three); off, it picks the one lane shown.
  const pickLane = useCallback((l) => {
    if (!split) { setLane(l); return; }
    setSplitLanes((prev) => {
      let next = prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l];
      if (next.length === 0) next = [l];
      if (next.length > 3) next = next.slice(-3);
      next = LANES.filter((x) => next.includes(x));
      saveLocal(SPLIT_LANES_KEY, JSON.stringify(next));
      return next;
    });
  }, [split]);

  const saveScope = useCallback(async () => {
    try {
      const s = await apiPost('/arch/scope', { repoIds: scopeDraft, fleet: fleetDraft });
      setState(s);
      setScopeOpen(false);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [scopeDraft, fleetDraft]);

  // Receiving-side opt-in: let fleet arch agents elsewhere send to THIS harness.
  const setAcceptSends = useCallback(async (accept) => {
    try {
      const s = await apiPost('/arch/fleet', { acceptSends: accept });
      setState(s);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  // Receiving-side opt-in (openspec arch-peer-upgrades): let a fleet arch elsewhere
  // upgrade THIS harness to a ref.
  const setAcceptUpgrades = useCallback(async (accept) => {
    try {
      const s = await apiPost('/arch/fleet', { acceptUpgrades: accept });
      setState(s);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  // Operator-triggered peer upgrade from the Fleet card (same posture as the arch tool).
  const [upgradeNote, setUpgradeNote] = useState({});
  const upgradePeer = useCallback(async (sourceId) => {
    setUpgradeNote((n) => ({ ...n, [sourceId]: '…' }));
    try {
      const r = await apiPost('/arch/fleet/upgrade', { sourceId });
      setUpgradeNote((n) => ({ ...n, [sourceId]: `${r.status}: ${r.detail || ''}` }));
      setTimeout(load, 1500);
    } catch (e) {
      setUpgradeNote((n) => ({ ...n, [sourceId]: e?.message || String(e) }));
    }
  }, [load]);

  // Calling-side consent per subscribed harness: the collector's own flag.
  const setAllowSends = useCallback(async (sourceId, allow) => {
    try {
      await apiPost(`/collector/sources/${sourceId}/sends`, { allow });
      setError('');
      setTimeout(load, 300);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [load]);

  // Start a goal conversation from this tab (openspec arch-goal-conversations): a new
  // conversation owning the picked agents / tasks with a goal loop armed on it; the host
  // tab strip is told so it opens the new conversation.
  const loadBoardTasks = useCallback(async () => {
    try {
      const b = await apiGet('/taskgraph');
      setBoardTasks((b?.nodes || []).filter((n) => n.status !== 'done'));
    } catch {
      setBoardTasks([]);
    }
  }, []);
  const startGoal = useCallback(async () => {
    const text = goalText.trim();
    if (!text) return;
    setGoalNote('…');
    try {
      const r = await apiPost('/arch/goals', { goal: text, repos: goalRepos, tasks: goalTasks, maxIterations: goalCap });
      setGoalNote(r?.detail || 'started');
      setGoalText(''); setGoalRepos([]); setGoalTasks([]);
      setError('');
      const id = r?.goal?.conversation?.id;
      if (id) onConversationChanged?.({ id, created: true, name: r.goal.conversation.name });
      setTimeout(load, 500);
    } catch (e) {
      setGoalNote(e?.message || String(e));
    }
  }, [goalText, goalRepos, goalTasks, goalCap, load, onConversationChanged]);
  const stopGoal = useCallback(async (id) => {
    if (!window.confirm(`Stop goal ${id}? Its conversation releases the repos and tasks it owns.`)) return;
    try { await apiPost(`/arch/goals/${encodeURIComponent(id)}/stop`, {}); setError(''); setTimeout(load, 300); } catch (e) { setError(e?.message || String(e)); }
  }, [load]);
  const queueForGoal = useCallback(async () => {
    const text = draft.trim();
    const id = state?.goal?.id;
    if (!text || !id) return;
    try {
      const r = await apiPost(`/arch/goals/${encodeURIComponent(id)}/message`, { text });
      setDraft('');
      setQueueNote(r?.detail || 'queued');
      setError('');
      setTimeout(load, 300);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [draft, state, load]);
  const stopTurn = useCallback(async () => {
    try { await apiPost(`/arch/stop-turn${convQ}`, {}); setTimeout(load, 500); } catch (e) { setError(e?.message || String(e)); }
  }, [load, convQ]);

  const openDock = useCallback((tabId) => {
    if (!tabId) return;
    setActiveTab(tabId);
    if (popup && onOpenDock) onOpenDock();
    else navigate('/studio');
  }, [setActiveTab, navigate, popup, onOpenDock]);

  // Drag the gutter between the conversation and the side column: the column's
  // width follows the pointer (pointer capture keeps the drag alive over the
  // scrolling content), clamped so neither side collapses; persisted per device.
  const startSideDrag = useCallback((e) => {
    const cols = colsRef.current;
    if (!cols) return;
    e.preventDefault();
    const total = cols.getBoundingClientRect().width;
    const startX = e.clientX;
    const startW = sideWidth;
    const gutter = e.currentTarget;
    gutter.setPointerCapture?.(e.pointerId);
    setSideDrag(true);
    let latest = startW;
    const onMove = (ev) => {
      latest = Math.round(Math.max(SIDE_MIN, Math.min(total * 0.7, startW - (ev.clientX - startX))));
      setSideWidth(latest);
    };
    const onUp = () => {
      gutter.removeEventListener('pointermove', onMove);
      gutter.removeEventListener('pointerup', onUp);
      gutter.removeEventListener('pointercancel', onUp);
      setSideDrag(false);
      saveLocal(SIDE_WIDTH_KEY, latest);
    };
    gutter.addEventListener('pointermove', onMove);
    gutter.addEventListener('pointerup', onUp);
    gutter.addEventListener('pointercancel', onUp);
  }, [sideWidth]);
  const toggleSide = useCallback(() => {
    setSideOpen((v) => { saveLocal(SIDE_OPEN_KEY, v ? '0' : '1'); return !v; });
  }, []);

  if (!enabled) return <div className="arch arch--off">The Arch tab is an Advanced-mode feature.</div>;

  const agents = state?.agents || [];
  const repos = state?.repos || [];
  const managed = new Set(state?.managedRepoIds || []);
  const managedFleet = new Set(state?.managedFleet || []);
  const fleet = state?.fleet || { sources: [] };
  const fleetSources = fleet.sources || [];
  // Repo id → human name for every repo the state knows (this harness's registry,
  // the managed agents, every peer's describe): the History lane shows ids as
  // "name (id…)" instead of a bare id.
  const repoNames = {};
  for (const r of repos) if (r.id) repoNames[r.id] = r.name || r.id;
  for (const a of agents) if (a.repoId && a.name && a.name !== a.repoId) repoNames[a.repoId] = a.machine && a.machine !== 'self' ? `${a.name} @ ${a.machine}` : a.name;
  for (const s of fleetSources) for (const r of s.repos || []) if (r.repoId && r.name) repoNames[r.repoId] = `${r.name} @ ${s.label}`;
  const peerText = (s) => {
    const p = s.peer || {};
    if (p.status === 'ok') return `peer ok · build ${p.version || '?'}${p.behind ? ' (behind this hub)' : ''} · ${p.acceptsSends ? 'accepts sends' : 'does not accept sends'} · ${p.acceptsUpgrades ? 'accepts upgrades' : 'does not accept upgrades'}${p.gateOpen ? '' : ' · gate closed'}`;
    if (p.status === 'no-peer-api') return 'no peer API on that build — upgrade it';
    if (p.status === 'unauthorized') return 'peer refused the credential';
    if (p.status === 'unreachable') return `unreachable${p.detail ? ` · ${p.detail}` : ''}`;
    if (p.status === 'never') return 'not probed yet';
    return `${p.status || '?'}${p.detail ? ` · ${p.detail}` : ''}`;
  };

  const convName = state?.conversation?.name || (conv === '@arch' ? 'Arch agent' : conv);
  const isDefaultConv = !state?.conversation || state.conversation.isDefault !== false;
  // This conversation's goal (openspec arch-goal-conversations) and whether it is busy
  // with it: while busy the composer queues Operator messages instead of sending.
  const goal = state?.goal || null;
  const busy = !!state?.busy;
  const goals = state?.goals || [];
  const ownsText = (g) => [...(g?.owns || []).map((o) => o.handle), ...(g?.tasks || []).map((tk) => `task ${tk.title}`)].join(', ') || 'nothing';
  const pollText = (g) => `polls every ${Math.max(1, Math.round((g?.pollSeconds || 300) / 60))} min${g?.lastSentAt ? ` · last poll ${ago(g.lastSentAt)} ago` : ''}`;

  // This conversation's loop cards (openspec arch-conversations): the standing wake
  // loop and the driven loop live in the Loops lane of the conversation they belong to.
  const loopCards = (
    <>
        <section className="arch__card" data-arch-standing>
          <div className="arch__card-head">
            <span>Standing wake loop</span>
            {drivenArmed
              ? <span className="arch__dim" data-standing-paused>paused while the {loop.kind} loop runs — it returns when that ends</span>
              : standingArmed
              ? <button type="button" className="arch__btn arch__btn--danger" onClick={() => loopAction({ action: 'disarm' })}>■ Stop arch agent</button>
              : (
                <button type="button" className="arch__btn arch__btn--primary" onClick={() => loopAction({ action: 'arm', mode, maxIterations: cap })} disabled={managed.size === 0 || !state?.gateOpen}>
                  ▶ Arm
                </button>
              )}
          </div>
          <div className="arch__row">
            <label>
              mode
              <select value={mode} onChange={(e) => { setMode(e.target.value); if (armed) loopAction({ action: 'mode', mode: e.target.value }); }}>
                <option value="drive">drive — sends wake-ups itself</option>
                <option value="suggest">suggest — pre-fills the composer</option>
              </select>
            </label>
            <label>
              cap (0 = none)
              <input type="number" min={0} max={100} value={cap} onChange={(e) => setCap(Math.max(0, Number(e.target.value) || 0))} disabled={armed} title="0 = no cap: the arch agent stays armed until you stop it" />
            </label>
          </div>
          <div className="arch__dim">
            {state?.engine ? `engine: ${state.engine.decision}${state.engine.reason ? ` — ${state.engine.reason}` : ''}` : 'engine: idle'}
            {' · '}watermark {state?.watermark ?? '–'}
          </div>
          <div className="arch__dim">Stop = disarm: no further sends; running repo turns finish on their own.</div>
        </section>

        <section className="arch__card" data-arch-goal-form>
          <div className="arch__card-head"><span>Goal conversation</span>{goal && <span className={`arch__pill arch__pill--${busy ? 'busy' : 'off'}`} data-goal-state>{busy ? `busy: goal ${goal.id}` : `goal ${goal.id} ${goal.state}`}</span>}</div>
          {goal && (
            <div className="arch__dim" data-goal-summary>
              <b>{goal.goal}</b> · drives {ownsText(goal)} · {goal.iterations}/{goal.maxIterations || '∞'} turn(s) · {pollText(goal)}{goal.queued ? ` · ${goal.queued} queued message(s)` : ''}{goal.outcome ? ` · ${goal.outcome}` : ''}
              {busy && <> <button type="button" className="arch__btn arch__btn--danger" onClick={() => stopGoal(goal.id)} data-stop-goal>■ Stop goal</button></>}
            </div>
          )}
          <div className="arch__dim" style={{ marginBottom: 6 }}>Top-down work: a goal opens its own conversation — the arch on a timer. Every poll interval (the "re-prompt at least every" setting below) it re-reads the goal, checks the agents and board tasks you pick and acts; the agents never call it. This conversation stays free; the summary lands here when the goal ends.</div>
          <textarea
            className="arch__goal-text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="What done looks like — e.g. every open board task for prg lands as a PR against main"
            rows={2}
            data-goal-text
            onFocus={() => { if (boardTasks === null) loadBoardTasks(); }}
          />
          <div className="arch__goal-pick" data-goal-repos>
            <span className="arch__dim">drives agents:</span>
            {agents.length === 0 && <span className="arch__dim"> none in scope</span>}
            {agents.map((a) => (
              <label key={a.key || a.repoId} className="arch__scope-row arch__scope-row--inline">
                <input type="checkbox" checked={goalRepos.includes(a.handle || a.key)} onChange={(e) => setGoalRepos((d) => (e.target.checked ? [...d, a.handle || a.key] : d.filter((x) => x !== (a.handle || a.key))))} />
                {a.handle || a.name}
              </label>
            ))}
          </div>
          <div className="arch__goal-pick" data-goal-tasks>
            <span className="arch__dim">drives board tasks:</span>
            {boardTasks === null && <button type="button" className="arch__link" onClick={loadBoardTasks}>load the board</button>}
            {boardTasks !== null && boardTasks.length === 0 && <span className="arch__dim"> no open tasks</span>}
            {(boardTasks || []).map((n) => (
              <label key={n.id} className="arch__scope-row arch__scope-row--inline" title={n.id}>
                <input type="checkbox" checked={goalTasks.includes(n.id)} onChange={(e) => setGoalTasks((d) => (e.target.checked ? [...d, n.id] : d.filter((x) => x !== n.id)))} />
                {n.title}{n.repoId ? '' : ' (unassigned)'}
              </label>
            ))}
          </div>
          <div className="arch__row">
            <label>
              cap
              <input type="number" min={1} max={100} value={goalCap} onChange={(e) => setGoalCap(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} data-goal-cap />
            </label>
            <button type="button" className="arch__btn arch__btn--primary" style={{ alignSelf: 'flex-end' }} onClick={startGoal} disabled={!goalText.trim() || !state?.gateOpen || (goalRepos.length === 0 && goalTasks.length === 0)} data-start-goal>▶ Start goal conversation</button>
          </div>
          {goalNote && <div className="arch__dim" data-goal-note>{goalNote}</div>}
        </section>

        <section className="arch__card" data-arch-driven>
          <div className="arch__card-head"><span>Driven loop (goal · recipe)</span></div>
          <div className="arch__dim" style={{ marginBottom: 6 }}>The dock's loop kinds, armed on the arch agent's own conversation. A goal or recipe takes the one loop slot; the standing wake loop pauses and comes back when it ends. A repeat of the same prompt waits for a managed repo turn; a question holds instead of stopping.</div>
          <DockLoopControl repoId={conv} repoName={convName} sessionId={sessionId} tabId={null} stash={[]} loop={driven} recipes={recipes} onChanged={load} onUsePending={(text) => setDraft(text)} kinds={['goal', 'recipe']} />
          <div className="arch__row" style={{ marginTop: 8 }}>
            <label>
              re-prompt at least every (min)
              <input
                type="number"
                min={1}
                max={1440}
                value={quietMin}
                onChange={(e) => setQuietMin(Math.max(1, Number(e.target.value) || 1))}
                onBlur={() => loopAction({ action: 'quiet', quietSeconds: quietMin * 60 })}
                title="A repeat of the same prompt waits for a managed repo turn, but never longer than this — so a dark peer cannot park the loop"
                data-quiet-floor
              />
            </label>
            {drivenArmed && state?.engine?.reason && (
              <span className="arch__dim" data-driven-reason>engine: {state.engine.decision} — {state.engine.reason}</span>
            )}
          </div>
        </section>
    </>
  );

  // The fleet-wide cards — Managed agents, Fleet, Home repo — shared by every
  // conversation: beside the conversation, as the Fleet lane, or on the Status tab.
  const sideCards = (
    <>
        <section className="arch__card">
          <div className="arch__card-head">
            <span>Managed agents ({agents.length})</span>
            <button type="button" className="arch__btn" onClick={() => { setScopeDraft([...managed]); setFleetDraft([...managedFleet]); setScopeOpen((o) => !o); }}>scope ✎</button>
          </div>
          {scopeOpen && (
            <div className="arch__scope">
              <div className="arch__scope-group">{fleet.selfLabel || 'this machine'} (self)</div>
              {repos.map((r) => (
                <label key={r.id} className="arch__scope-row">
                  <input
                    type="checkbox"
                    checked={scopeDraft.includes(r.id)}
                    onChange={(e) => setScopeDraft((d) => (e.target.checked ? [...d, r.id] : d.filter((x) => x !== r.id)))}
                  />
                  {r.name}{r.isSelf ? ' (harness)' : ''}{r.exists ? '' : ' — missing'}
                </label>
              ))}
              {fleetSources.map((s) => {
                const offerable = s.peer?.status === 'ok' && s.allowSends;
                return (
                  <div key={s.id} className="arch__scope-machine">
                    <div className="arch__scope-group">
                      <span className="arch__machine">{s.label}</span>
                      <span className="arch__dim"> · {offerable ? `${(s.repos || []).length} repo(s)` : !s.allowSends && s.peer?.status === 'ok' ? 'allow sends first (Fleet card)' : peerText(s)}</span>
                    </div>
                    {offerable && (s.repos || []).map((r) => (
                      // The peer's OWN arch scope decides (openspec add-fleet-arch-agent, D8):
                      // a repo its arch does not manage is shown, named as such, and cannot
                      // be scoped here — the fix is on that machine's Arch tab.
                      <label key={r.key} className={`arch__scope-row${r.managed === true ? '' : ' arch__scope-row--off'}`} data-managed-there={String(r.managed)}>
                        <input
                          type="checkbox"
                          disabled={r.managed !== true}
                          checked={fleetDraft.includes(r.key)}
                          onChange={(e) => setFleetDraft((d) => (e.target.checked ? [...d, r.key] : d.filter((x) => x !== r.key)))}
                        />
                        {r.name}{r.isSelf ? ' (harness)' : ''}{r.exists ? '' : ' — missing'}
                        {r.managed === true
                          ? <span className={`arch__avail arch__avail--${AVAIL_CLASS[r.availability] || 'dim'}`}>{r.availability}</span>
                          : <span className="arch__avail arch__avail--dim">{r.managed === false ? `not in ${s.label}'s arch scope` : 'peer build does not report its scope'}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
              <div className="arch__composer-row">
                <button type="button" className="arch__btn arch__btn--primary" onClick={saveScope}>Save scope</button>
                <button type="button" className="arch__btn" onClick={() => setScopeOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {agents.length === 0 && !scopeOpen && <div className="arch__dim">No managed repos. Open the scope picker.</div>}
          {agents.map((a) => (
            <div key={a.key || a.repoId} className="arch__agent" data-machine={a.machine}>
              <div className="arch__agent-top">
                <span className="arch__agent-name" title={a.handle ? `${a.handle} — say this handle to the arch agent` : undefined}>
                  {a.isLocal === false && <span className="arch__machine" title={`on machine ${a.machine}`}>{a.machine}</span>}
                  {a.name}
                  {a.handle && <span className="arch__handle" data-handle={a.handle}>{a.handle.split('/').pop()}</span>}
                </span>
                <span className={`arch__avail arch__avail--${AVAIL_CLASS[a.availability] || 'dim'}`}>{a.availability}</span>
              </div>
              <div className="arch__dim arch__mono">
                {a.branch}{a.dirty ? ' · dirty' : ''}{a.branch !== a.defaultBranch ? ` (default ${a.defaultBranch})` : ''}
              </div>
              {a.isLocal === false && a.sendable === false && a.blocked && (
                <div className="arch__dim arch__blocked" data-blocked="true">not sendable: {a.blocked}</div>
              )}
              <div className="arch__dim">
                last actor {a.lastActor}
                {a.runningSince ? ` · running ${ago(a.runningSince)}` : ''}
                {/* openspec arch-branch-handover: why it is claimed, or the caveat on an unassigned branch */}
                {a.availability === 'claimed' && a.claimedReason === 'pinned' ? ' · pinned as yours — left alone' : ''}
                {a.availability === 'claimed' && a.claimedReason !== 'pinned' ? ' · your branch (worked on recently) — left alone; hand it over from the dock' : ''}
                {a.availability !== 'claimed' && a.claimedReason === 'unassigned-branch' ? ' · unassigned branch — the arch names it in its sends' : ''}
                {a.adopted ? ' · handed to the arch' : ''}
              </div>
              {a.tabId
                ? <button type="button" className="arch__link" onClick={() => openDock(a.tabId)}>open dock ↗</button>
                : <span className="arch__dim">{a.isLocal === false ? `dock on ${a.machine}` : 'no dock tab yet'}</span>}
            </div>
          ))}
        </section>

        <section className="arch__card arch__fleet">
          <div className="arch__card-head">
            <span>Fleet</span>
            <span className="arch__dim arch__mono" title={fleet.version || ''}>{fleet.selfLabel}{fleet.version ? ` · ${(/\+([0-9a-f]{7})/.exec(fleet.version) || [])[1] || fleet.version}` : ''}</span>
          </div>
          <label className="arch__scope-row">
            <input
              type="checkbox"
              checked={!!fleet.acceptSends}
              disabled={!state?.gateOpen}
              onChange={(e) => setAcceptSends(e.target.checked)}
            />
            accept fleet sends (let arch agents on other machines task this harness's repos)
          </label>
          <label className="arch__scope-row">
            <input
              type="checkbox"
              data-accept-upgrades
              checked={!!fleet.acceptUpgrades}
              disabled={!state?.gateOpen}
              onChange={(e) => setAcceptUpgrades(e.target.checked)}
            />
            accept fleet upgrades (let a hub's arch agent bring this harness to main and redeploy it)
          </label>
          {fleet.upgradeJob && (
            <div className="arch__dim arch__mono" data-upgrade-job={fleet.upgradeJob.state}>
              upgrade {fleet.upgradeJob.id}: {fleet.upgradeJob.state} · {String(fleet.upgradeJob.fromCommit || '').slice(0, 7)} → {String(fleet.upgradeJob.targetCommit || '').slice(0, 7)}{fleet.upgradeJob.requestedBy ? ` · by ` : ''}{fleet.upgradeJob.detail ? ` · ` : ''}
            </div>
          )}
          {fleetSources.length === 0 && <div className="arch__dim">No subscribed harnesses. Add one in the Harness Event Feed app (Local tab), then allow sends here.</div>}
          {fleetSources.map((s) => (
            <div key={s.id} className="arch__agent" data-source={s.id}>
              <div className="arch__agent-top">
                <span className="arch__agent-name"><span className="arch__machine">{s.label}</span></span>
                <span className={`arch__avail arch__avail--${s.peer?.status === 'ok' ? 'ok' : s.peer?.status === 'never' ? 'dim' : 'claimed'}`}>{s.peer?.status || '?'}</span>
              </div>
              <div className="arch__dim arch__mono arch__wrap">{s.address}</div>
              <div className="arch__dim">{peerText(s)}{s.status && s.status !== 'active' ? ` · feed ${s.status}` : ''}</div>
              {s.peer?.status === 'ok' && (
                <div className="arch__dim" data-managed-there={s.managedThere ?? 0}>
                  its arch manages {s.managedThere ?? 0} of {(s.repos || []).length} repo(s)
                  {(s.managedThere ?? 0) === 0 ? ' — nothing can be sent there until its operator scopes a repo on its Arch tab' : ''}
                </div>
              )}
              <label className="arch__scope-row">
                <input type="checkbox" checked={!!s.allowSends} onChange={(e) => setAllowSends(s.id, e.target.checked)} />
                allow sends to {s.label}
              </label>
              {s.peer?.status === 'ok' && s.peer?.behind && (
                <div className="arch__dim" data-behind>
                  <button type="button" className="arch__btn" disabled={!s.allowSends || !s.peer?.acceptsUpgrades || upgradeNote[s.id] === '…'} onClick={() => upgradePeer(s.id)}>upgrade to this build</button>
                  {!s.peer?.acceptsUpgrades ? ' its operator has not enabled accept fleet upgrades' : !s.allowSends ? ' allow sends first' : ''}
                  {upgradeNote[s.id] ? ` · ${upgradeNote[s.id]}` : ''}
                </div>
              )}
            </div>
          ))}
          <div className="arch__dim">Both sides opt in: you allow sends to a machine here; its operator accepts fleet sends there. The collector itself only ever reads.</div>
        </section>

        <section className="arch__card">
          <div className="arch__card-head"><span>Home repo</span></div>
          <div className="arch__dim arch__mono arch__wrap">{state?.home?.path}</div>
          {!state?.home?.exists && <div className="arch__dim">not created yet — arming creates it</div>}
          {(state?.home?.commits || []).map((c) => (
            <div key={c.sha} className="arch__dim arch__mono">{c.sha} {c.subject} <span className="arch__dim">· {ago(c.at)} ago</span></div>
          ))}
          <div className="arch__dim">Tools denied in its session: {(state?.disallowedTools || []).join(', ')}. It reads repos through the harness only.</div>
        </section>

        <section className="arch__card" data-arch-goals>
          <div className="arch__card-head"><span>Goal conversations ({goals.filter((g) => g.busy).length} busy)</span></div>
          <div className="arch__dim" style={{ marginBottom: 6 }}>Each goal conversation is the arch on a timer: it polls the agents it drives and acts; the agents never call it. Your conversation only gets the summary.</div>
          {goals.length === 0 && <div className="arch__dim">None yet. Start one from a conversation's Loops lane, or ask the arch agent: "arch, run a goal: … on …".</div>}
          {goals.map((g) => (
            <div key={g.id} className="arch__agent" data-goal={g.id} data-goal-busy={g.busy}>
              <div className="arch__agent-top">
                <span className="arch__agent-name">{g.conversation?.name || g.conversation?.id}</span>
                <span className={`arch__pill arch__pill--${g.busy ? 'busy' : g.state === 'done' ? 'on' : 'off'}`}>{g.busy ? `busy: goal ${g.id}` : `${g.state} · goal ${g.id}`}</span>
              </div>
              <div className="arch__dim">{g.goal}</div>
              <div className="arch__dim">drives {ownsText(g)} · {g.iterations}/{g.maxIterations || '∞'} turn(s) · {pollText(g)}{g.outcome ? ` · ${g.outcome}` : ''}</div>
              {g.busy && <button type="button" className="arch__link" onClick={() => stopGoal(g.id)}>■ stop goal</button>}
            </div>
          ))}
        </section>
    </>
  );
  const chatOnly = view === 'chat';
  const showSide = view === 'full' && sideOpen && lane !== 'fleet' && !split;

  if (view === 'cards') {
    return (
      <div className="arch arch--cards" data-arch-cards>
        {!state && <div className="arch__banner arch__banner--loading" data-loading>Loading the arch state…</div>}
        {state && !state.gateOpen && <div className="arch__banner">Autopilot is disabled by the operator (host GUI). The arch agent cannot act until the gate is open.</div>}
        {error && <div className="arch__banner arch__banner--err">{error}</div>}
        <div className="arch__overview" data-overview>{sideCards}</div>
      </div>
    );
  }

  // One lane's body (openspec arch-conversations): rendered once as the main body,
  // or once per column when the split is on.
  const renderLane = (l) => (
    l === 'tools' ? <ArchToolsPanel />
    : l === 'fleet' ? <div className="arch__overview" data-overview>{sideCards}</div>
    : l === 'loops' ? <div className="arch__overview arch__overview--loops" data-loops-lane>{loopCards}</div>
    : l === 'history' ? <ArchHistoryPanel liveTurn={turn} sessionId={sessionId} repoNames={repoNames} conv={conv} />
    : (
      <>
        <div className="arch__scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="arch__empty">
              <p>No conversation yet. Pick the repos it manages, arm it, then tell it what you want across them.</p>
              <p className="arch__dim">Its home repo: <code>{state?.home?.path}</code>{state?.home?.exists ? '' : ' (created on first arm)'}</p>
            </div>
          )}
          {visible.map((m, i) => (
            <div key={i} className="turn">
              <MessageBubble role={m.role} text={m.text} actor={m.actor} />
            </div>
          ))}
          {turn && (
            <div className="turn arch__live" data-live={turn.active ? 'on' : 'settled'}>
              {turn.user && <MessageBubble role="user" text={turn.user.text} actor={turn.user.actor} />}
              {turn.assistant.steps.length > 0 && <ActivitySteps steps={turn.assistant.steps} />}
              {turn.assistant.text && <MessageBubble role="assistant" text={turn.assistant.text} />}
              {turn.active && !turn.assistant.text && turn.assistant.steps.length === 0 && <ThinkingIndicator />}
              {turn.error && <div className="arch__banner arch__banner--err">{turn.error}</div>}
            </div>
          )}
          {running && !turn && <div className="arch__thinking">arch agent is working…</div>}
        </div>
        {busy && goal && (
          <div className="arch__banner" data-goal-busy-banner>
            <b>busy: goal {goal.id}</b> — {goal.goal} · drives {ownsText(goal)} · {goal.iterations}/{goal.maxIterations || '∞'} turn(s) · {pollText(goal)}{state?.engine?.reason ? ` · ${state.engine.reason}` : ''}.
            {' '}Messages typed here are queued as Operator messages and carried by its next poll — or start another goal conversation from the Loops lane.
            {' '}<button type="button" className="arch__link" onClick={() => pickLane('loops')} data-new-goal>new goal conversation</button>
          </div>
        )}
        <div className="arch__composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pending ? 'Pending wake-up (suggest mode) — send it or edit it' : 'Tell the arch agent what you want across the repos it manages…'}
            rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
          />
          <div className="arch__composer-row">
            {busy && goal
              ? <button type="button" className="arch__btn arch__btn--primary" onClick={queueForGoal} disabled={!draft.trim()} data-queue-goal>Queue for the goal</button>
              : (
                <button type="button" className="arch__btn arch__btn--primary" onClick={send} disabled={running || !draft.trim()}>
                  {running ? 'busy' : 'Send'}
                </button>
              )}
            {busy && queueNote && <span className="arch__dim" data-queue-note>{queueNote}</span>}
            {running && <button type="button" className="arch__btn arch__btn--danger" onClick={stopTurn}>Stop turn</button>}
            <span className="arch__dim">Ctrl+Enter sends. Messages here are the only instructions it follows.</span>
          </div>
        </div>
      </>
    )
  );
  const laneOn = (l) => (split ? splitLanes.includes(l) : lane === l);
  const laneChip = (l, icon, label, title) => (
    <button
      type="button"
      role="tab"
      aria-selected={laneOn(l)}
      className={`arch__lane${laneOn(l) ? ' arch__lane--on' : ''}`}
      title={split ? `${title} — click to add or remove this column` : title}
      data-lane={l}
      onClick={() => pickLane(l)}
    >
      {icon} {label}
    </button>
  );
  const shownLanes = split ? splitLanes.filter((l) => !(chatOnly && l === 'fleet')) : [lane];

  return (
    <div className={`arch${popup ? ' arch--popup' : ''}${sideDrag ? ' arch--sidedrag' : ''}${chatOnly ? ' arch--chat' : ''}${showSide ? '' : ' arch--solo'}`}>
      <div className="arch__cols" ref={colsRef}>
      <div className="arch__main">
        {/* Pinned header (openspec pin-conversation-lanes): title row + lane strip
            stay in view however far the transcript is scrolled — see arch.css. */}
        <div className="arch__top" data-conversation-head>
        <div className="arch__head">
          <input
            className="arch__name"
            value={nameDraft}
            placeholder={convName}
            title="The name of this arch conversation — edit and press Enter"
            aria-label="Conversation name"
            data-conv-name
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={renameConversation}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNameDraft(state?.conversation?.name || ''); e.currentTarget.blur(); } }}
            size={Math.max(8, Math.min(40, (nameDraft || convName).length + 1))}
          />
          {!isDefaultConv && (
            <button type="button" className="arch__btn arch__btn--ghost" title="Remove this conversation (its loop stops; the transcript stays on disk)" onClick={removeConversation} data-remove-conv>
              × remove
            </button>
          )}
          <span className="arch__meta">
            {loop ? (
              <>
                <span className={`arch__pill arch__pill--${armed ? 'on' : 'off'}`}>{armed ? 'armed' : `loop ${loop.status}`}</span>
                {' · '}{loop.mode}{' · '}{loop.iterationsDone}/{loop.maxIterations || '∞'}
                {loop.stopReason ? ` · ${loop.stopReason}${loop.stopDetail ? `: ${loop.stopDetail}` : ''}` : ''}
              </>
            ) : <span className="arch__pill arch__pill--off">never armed</span>}
            {running && <span className="arch__pill arch__pill--busy">turn running</span>}
            {drivenArmed && <span className="arch__pill arch__pill--on" data-driven-pill>{loop.kind} loop · {loop.iterationsDone}/{loop.maxIterations || '∞'}</span>}
            {goal && <span className={`arch__pill arch__pill--${busy ? 'busy' : 'off'}`} data-goal-pill title={`${goal.goal} — owns ${ownsText(goal)}`}>{busy ? `busy: goal ${goal.id}` : `goal ${goal.id} ${goal.state}`} · drives {ownsText(goal)}</span>}
            {sessionId && <span className="arch__dim"> · session {sessionId.slice(0, 8)}</span>}
          </span>
          <button
            type="button"
            className="arch__copy-ctx"
            title="Copy a prompt that tells a repo agent (in any chat on this harness) where this conversation lives and how to read it"
            onClick={copyAgentPrompt}
          >
            {copiedCtx ? '✓ copied' : '⧉ Copy agent prompt'}
          </button>
        </div>
        <div className="arch__lanes" role="tablist" aria-label="Arch lanes" data-split={split ? 'on' : 'off'}>
          {laneChip('chat', '💬', 'Chat', 'Talk to the arch agent — the only instructions it follows')}
          {laneChip('tools', '🔌', 'Tools', 'The harness tools the arch session gets on every turn')}
          {laneChip('history', '🧾', 'History', 'Every tool call of this conversation, with its arguments and result')}
          {laneChip('loops', '🔁', 'Loops', "This conversation's loops: the standing wake loop and a goal or recipe driven on it")}
          {!chatOnly && laneChip('fleet', '🛰', 'Fleet', 'The managed agents, the fleet and the home repo, full width')}
          <button
            type="button"
            className={`arch__side-toggle arch__split-toggle${split ? ' arch__split-toggle--on' : ''}`}
            aria-pressed={split}
            title={split ? 'Back to one lane at a time' : 'Show lanes side by side (pick them with the chips)'}
            onClick={toggleSplit}
            data-split-toggle
          >
            {split ? '⫴ split on' : '⫴ split'}
          </button>
          {!chatOnly && lane !== 'fleet' && !split && (
            <button
              type="button"
              className="arch__side-toggle"
              aria-pressed={sideOpen}
              title={sideOpen ? 'Hide the side column (the Fleet lane keeps its cards)' : 'Show the side column'}
              onClick={toggleSide}
            >
              {sideOpen ? '▥ hide side' : '▥ show side'}
            </button>
          )}
        </div>
        </div>
        {!state && <div className="arch__banner arch__banner--loading" data-loading>Loading the arch state…</div>}
        {state && !state.gateOpen && <div className="arch__banner">Autopilot is disabled by the operator (host GUI). The arch agent cannot act until the gate is open.</div>}
        {state?.gateOpen && state?.killSwitch === false && <div className="arch__banner">The autopilot kill switch is off: the arch loop is paused.</div>}
        {error && <div className="arch__banner arch__banner--err">{error}</div>}
        {armed && state?.engine?.decision === 'escalate' && (
          <div className="arch__banner" data-waiting>⏸ Waiting for you: {state.engine.label || state.engine.reason}. Reply in the conversation to continue — the loop stays armed and wake-ups from other repos still arrive.</div>
        )}
        {split ? (
          <div className="arch__split" data-split-cols={shownLanes.join(',')}>
            {shownLanes.map((l) => (
              <div key={l} className="arch__split-col" data-split-col={l}>
                <div className="arch__split-head">{l === 'chat' ? '💬 Chat' : l === 'tools' ? '🔌 Tools' : l === 'history' ? '🧾 History' : l === 'loops' ? '🔁 Loops' : '🛰 Fleet'}</div>
                {renderLane(l)}
              </div>
            ))}
          </div>
        ) : renderLane(lane)}
      </div>

      {showSide && (
        <>
          <div
            className="arch__gutter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize the side column"
            title="Drag to resize"
            onPointerDown={startSideDrag}
          />
          <aside className="arch__side" style={{ flex: `0 0 ${sideWidth}px`, width: sideWidth }} data-side-width={sideWidth}>
            {sideCards}
          </aside>
        </>
      )}
      </div>
    </div>
  );
}
