// The phone remote (openspec sofa-mode, design D3): a plain web page fitted for a phone — not a PWA —
// that pairs once with the PIN shown on the big screen, lists the agents with their badges, tells the
// big screen what to open (open-agent / open-view / scroll / zoom / lane), writes to the opened agent
// (or the arch) through the same POST /api/chat every composer uses, stops a run, peeks at the last
// reply and mirrors an open AskUserQuestion as buttons. Every part but the big-screen commands works
// with no screen listening at all — the page is also "message my agents from anywhere".
//
// Fleet agents (openspec remote-fleet-agents): the list is grouped by machine — this harness's dock
// first, then every peer the fleet status knows (a dark one greyed, never dropped). The phone stays
// paired with THIS harness only: a peer's agent is written to, read and stopped through the relay
// (/api/remote/relay/<sourceId>/…), and opening it sends the big screen to the peer's own harness,
// auto-logged-in with a one-shot PIN the hub mints there (the `navigate` command). The phone remembers
// where the screen is (`screenOn`) and posts every command to the harness it is paired with, which
// enqueues it where the screen listens. This same page, opened by the big screen with ?pin=&then=,
// redeems the PIN and continues to `then` — that is how the projector logs itself in on a peer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import {
  REMOTE_VIEWS, badgeOf, chatBody, cleanPin, lastReply, openQuestion, showingLine, targetLabel, sofaOn, appsOf,
  apiPathFor, fleetGroups, dockTabFor, followScreen, pinHop,
} from '../components/remote/remoteModel.js';
import './remote.css';

const SCREEN_ON_KEY = 'claudeweb_remote_screen_on';

function PairScreen({ onUnlock, hop }) {
  const { t } = useT();
  const [pin, setPin] = useState('');
  const [state, setState] = useState(hop?.pin ? 'busy' : ''); // '' | busy | wrong | locked | error
  const redeem = useCallback(async (code) => {
    setState('busy');
    try {
      const res = await fetch('/api/remote/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: code }) });
      if (res.ok) {
        if (hop?.then) { window.location.replace(hop.then); return; } // the big screen continues to its page, logged in
        onUnlock(); return;
      }
      setState(res.status === 429 ? 'locked' : res.status === 401 ? 'wrong' : 'error');
    } catch { setState('error'); }
    setPin('');
  }, [hop, onUnlock]);
  // A PIN hop: redeem at once, no typing — the hub minted this PIN for this very screen.
  useEffect(() => { if (hop?.pin) redeem(hop.pin); }, [hop, redeem]);
  const submit = (e) => { e?.preventDefault(); if (pin.length === 6) redeem(pin); };
  if (hop?.pin && state === 'busy') {
    return <div className="remote remote--pair"><h1 className="remote__h1">📺 {t('remote.title')}</h1><p className="remote__lead">{t('remote.hopping')}</p></div>;
  }
  return (
    <form className="remote remote--pair" onSubmit={submit}>
      <h1 className="remote__h1">📺 {t('remote.title')}</h1>
      <p className="remote__lead">{t('remote.pairLead')}</p>
      <input
        className="remote__pin"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={pin}
        onChange={(e) => { setPin(cleanPin(e.target.value)); setState(''); }}
        placeholder="000 000"
        autoFocus
        aria-label={t('remote.pinLabel')}
      />
      <button type="submit" className="remote__btn remote__btn--primary" disabled={pin.length !== 6 || state === 'busy'}>{t('remote.pairButton')}</button>
      {state === 'wrong' && <p className="remote__err">{hop ? t('remote.hopExpired') : t('remote.pairWrong')}</p>}
      {state === 'locked' && <p className="remote__err">{t('remote.pairLocked')}</p>}
      {state === 'error' && <p className="remote__err">{t('remote.pairError')}</p>}
      <p className="remote__hint">{t('remote.pairHint')}</p>
    </form>
  );
}

export default function Remote({ unlocked, onUnlock }) {
  const { t } = useT();
  const hop = typeof window === 'undefined' ? null : pinHop(window.location.search);
  // Already logged in here and asked to continue: go (the big screen hopping back to a harness it knows).
  useEffect(() => { if (unlocked && hop?.then) window.location.replace(hop.then); }, [unlocked, hop]);
  if (!unlocked) return <PairScreen onUnlock={onUnlock} hop={hop} />;
  if (hop?.then) return <div className="remote remote--pair"><p className="remote__lead">{t('remote.hopping')}</p></div>;
  return <RemotePanel t={t} />;
}

function RemotePanel({ t }) {
  const [screens, setScreens] = useState([]);         // this harness's screens
  const [peerScreens, setPeerScreens] = useState([]); // the screens of the peer the big screen is on
  const [tabs, setTabs] = useState([]);
  const [fleet, setFleet] = useState(null);           // GET /api/arch/fleet/status (machines + agents)
  const [peerDock, setPeerDock] = useState([]);       // the relayed dock of the target's peer (session ids)
  const [repos, setRepos] = useState([]); // for the opened repo's local apps (the Apps row)
  useEffect(() => { apiGet('/repos').then((r) => setRepos(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  // { kind: 'agent', sourceId, machine, tabId, repoId, name, sessionId } | { kind: 'arch' }
  const [target, setTarget] = useState(null);
  const [screenOn, setScreenOnState] = useState(() => { try { return sessionStorage.getItem(SCREEN_ON_KEY) || 'self'; } catch { return 'self'; } });
  // The hop in flight: when the screen was sent to a peer, and whether that peer has shown it since —
  // the home harness keeps the departed tab's heartbeat for 20 s, which must not read as "it is home".
  const hopRef = useRef({ at: 0, seenThere: true });
  const setScreenOn = useCallback((v) => {
    setScreenOnState(v);
    hopRef.current = v === 'self' ? { at: 0, seenThere: true } : { at: Date.now(), seenThere: false };
    try { sessionStorage.setItem(SCREEN_ON_KEY, v); } catch { /* private mode */ }
  }, []);
  const [lane, setLane] = useState('builder');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [peek, setPeek] = useState(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState('');
  const targetRef = useRef(target); targetRef.current = target;
  const laneRef = useRef(lane); laneRef.current = lane;
  const screenOnRef = useRef(screenOn); screenOnRef.current = screenOn;

  // Polls: the screens (3 s, here and — through the relay — on the peer the screen is on), the dock
  // (5 s), the fleet status (10 s), the target's peer dock (5 s), the opened conversation (4 s).
  useEffect(() => {
    let stop = false;
    const screensPoll = async () => {
      const here = await apiGet('/remote/screens').then((s) => (Array.isArray(s) ? s : [])).catch(() => []);
      const on = screenOnRef.current;
      const there = on !== 'self' ? await apiGet(apiPathFor(on, '/remote/screens')).then((s) => (Array.isArray(s) ? s : [])).catch(() => []) : [];
      if (stop) return;
      setScreens(here); setPeerScreens(there);
      if (there.length) hopRef.current.seenThere = true;
      const next = followScreen(on, here, there, { seenThere: hopRef.current.seenThere, sinceHopMs: Date.now() - hopRef.current.at });
      if (next !== on) setScreenOn(next);
    };
    const dockPoll = () => apiGet('/dock').then((d) => { if (!stop) setTabs(Array.isArray(d) ? d : []); }).catch(() => {});
    const fleetPoll = () => apiGet('/arch/fleet/status').then((f) => { if (!stop) setFleet(f && typeof f === 'object' ? f : null); }).catch(() => {});
    screensPoll(); dockPoll(); fleetPoll();
    const a = setInterval(screensPoll, 3000);
    const b = setInterval(dockPoll, 5000);
    const c = setInterval(fleetPoll, 10000);
    return () => { stop = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [setScreenOn]);
  const peerOfTarget = target?.kind === 'agent' && target.sourceId !== 'self' ? target.sourceId : null;
  useEffect(() => {
    if (!peerOfTarget) { setPeerDock([]); return undefined; }
    let stop = false;
    const poll = () => apiGet(apiPathFor(peerOfTarget, '/dock')).then((d) => { if (!stop) setPeerDock(Array.isArray(d) ? d : []); }).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [peerOfTarget]);

  const refreshConversation = useCallback(async () => {
    const tg = targetRef.current;
    if (!tg) { setPeek(null); setQuestion(null); return; }
    try {
      if (tg.kind === 'arch') {
        const r = await apiGet('/arch/messages?tail=4');
        setPeek(lastReply(r?.messages));
        setQuestion(null);
        return;
      }
      const tab = tg.sourceId === 'self' ? tabs.find((x) => x.id === tg.tabId) : dockTabFor(peerDock, tg.repoId);
      const sessionId = tab?.sessionId || tg.sessionId;
      if (!sessionId) { setPeek(null); setQuestion(null); return; }
      const [messages, tools] = await Promise.all([
        apiGet(apiPathFor(tg.sourceId, `/sessions/${encodeURIComponent(sessionId)}/messages`), { repoId: tg.repoId }),
        apiGet(apiPathFor(tg.sourceId, `/sessions/${encodeURIComponent(sessionId)}/tools`), { repoId: tg.repoId }).catch(() => []),
      ]);
      setPeek(lastReply(messages));
      const q = openQuestion(tools, messages);
      setQuestion(q && answered !== q.question ? q : null);
    } catch { /* keep what we have */ }
  }, [tabs, peerDock, answered]);
  useEffect(() => {
    refreshConversation();
    const id = setInterval(refreshConversation, 4000);
    return () => clearInterval(id);
  }, [refreshConversation]);

  // Every command goes to the harness this phone is paired with, naming where the screen is; the
  // server enqueues it there (or turns a cross-machine open-agent into a navigate). Returns the reply.
  const screenName = (screenOn === 'self' ? screens : peerScreens)[0]?.name || screens[0]?.name || 'projector';
  const cmd = useCallback(async (type, args = {}) => {
    try { return await apiPost('/remote/commands', { type, args, screenOn: screenOnRef.current, screen: screenName }); }
    catch (e) { setNotice(e?.status === 401 ? t('remote.sessionLost') : e?.status === 502 ? t('remote.peerDown') : t('remote.cmdFailed')); return null; }
  }, [t, screenName]);

  const tapAgent = (group, a) => {
    if (!group.reachable) { setNotice(t('remote.machineDark').replace('{machine}', group.machine)); return; }
    setTarget({ kind: 'agent', sourceId: group.sourceId, machine: group.machine, tabId: a.tabId, repoId: a.repoId, name: a.name, sessionId: a.sessionId });
    setAnswered(''); setPeekOpen(false); setNotice('');
    cmd('open-agent', group.sourceId === 'self' ? { repoId: a.repoId } : { repoId: a.repoId, sourceId: group.sourceId }).then((r) => {
      if (!r?.ok) return;
      // The screen is where the agent lives now (a navigate takes a moment; the screens poll confirms).
      setScreenOn(group.sourceId);
      if (r.note && /login page/.test(r.note)) setNotice(t('remote.hopNoCredential').replace('{machine}', group.machine));
    });
  };
  const tapView = async (view) => {
    if (view === 'arch') { setTarget({ kind: 'arch' }); setAnswered(''); setPeekOpen(false); }
    // The views are this harness's: a screen that shows a peer comes home first, then opens the view —
    // the returning listener catches the command up from its own seq.
    if (screenOnRef.current !== 'self') { await cmd('navigate', {}); setScreenOn('self'); screenOnRef.current = 'self'; }
    cmd('open-view', { view });
  };
  const switchLane = (next) => { setLane(next); cmd('lane', { lane: next }); };

  const send = async (message) => {
    const tg = targetRef.current;
    const body = (message ?? text).trim();
    if (!tg || !body || sending) return;
    setSending(true); setNotice('');
    try {
      if (tg.kind === 'arch') {
        await apiPost('/arch/send', { text: body });
      } else {
        const tab = tg.sourceId === 'self' ? tabs.find((x) => x.id === tg.tabId) : dockTabFor(peerDock, tg.repoId);
        // POST /api/chat answers with the run's SSE stream; the run is detached on the server, so the
        // phone only needs the status line — it drops the body and lets the projector's dock stream.
        // For a peer's agent the relay does the same on the hub and answers { ok } once the run started.
        const res = await fetch(`/api${apiPathFor(tg.sourceId, '/chat')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Repo-Id': tg.repoId },
          body: JSON.stringify(chatBody(body, { lane: laneRef.current, sessionId: tab?.sessionId || tg.sessionId })),
        });
        if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
        try { await res.body?.cancel(); } catch { /* already closed */ }
      }
      if (message === undefined) setText('');
      setNotice(t('remote.sent'));
      setTimeout(() => setNotice((n) => (n === t('remote.sent') ? '' : n)), 2500);
    } catch (e) {
      setNotice(e?.status === 409 ? t('remote.busy') : e?.status === 401 ? t('remote.sessionLost') : e?.status === 403 ? t('remote.sendsOff') : e?.status === 502 ? t('remote.peerDown') : t('remote.sendFailed'));
    } finally { setSending(false); }
  };
  const answer = (label) => { setAnswered(question?.question || ''); setQuestion(null); send(label); };
  const stopRun = async () => {
    const tg = targetRef.current;
    if (!tg) return;
    try {
      if (tg.kind === 'arch') await apiPost('/arch/stop-turn');
      else await apiPost(apiPathFor(tg.sourceId, `/chat/stop?lane=${laneRef.current}`), undefined, { repoId: tg.repoId });
      setNotice(t('remote.stopped'));
    } catch (e) { setNotice(e?.status === 403 ? t('remote.sendsOff') : t('remote.cmdFailed')); }
  };

  const groups = fleetGroups(fleet, tabs);
  const liveScreens = screenOn === 'self' ? screens : (peerScreens.length ? peerScreens : screens);
  const showing = showingLine(liveScreens);
  const screenMachine = screenOn !== 'self' ? groups.find((g) => g.sourceId === screenOn)?.machine : '';
  const targetTab = target?.kind === 'agent' ? (target.sourceId === 'self' ? tabs.find((x) => x.id === target.tabId) : dockTabFor(peerDock, target.repoId)) : null;
  const fleetAgent = target?.kind === 'agent' && target.sourceId !== 'self' ? groups.find((g) => g.sourceId === target.sourceId)?.agents.find((a) => a.repoId === target.repoId) : null;
  const running = targetTab?.status === 'running' || fleetAgent?.status === 'running';
  const label = targetLabel(target, t);
  const onAgent = (a) => target?.kind === 'agent' && target.sourceId === a.sourceId && (a.sourceId === 'self' ? target.tabId === a.tabId : target.repoId === a.repoId);

  return (
    <div className="remote">
      <header className="remote__head">
        <div className="remote__title">📺 {t('remote.title')}</div>
        <div className={`remote__showing${showing ? '' : ' remote__showing--none'}`}>
          {showing ? t('remote.showing').replace('{what}', screenMachine ? `${screenMachine} · ${showing}` : showing) : t('remote.noScreen')}
        </div>
      </header>

      <div className="remote__views">
        {REMOTE_VIEWS.map((v) => (
          <button key={v} type="button" className={`remote__chip${target?.kind === 'arch' && v === 'arch' ? ' is-on' : ''}`} onClick={() => tapView(v)}>
            {t(`remote.view.${v}`)}
          </button>
        ))}
      </div>

      {target && (
        <section className="remote__target">
          <div className="remote__targethead">
            <span>{t('remote.writeTo').replace('{who}', target.kind === 'agent' && target.sourceId !== 'self' ? `${label} @ ${target.machine}` : label)}</span>
            {target.kind === 'agent' && (
              <span className="remote__lanes">
                <button type="button" className={`remote__lane${lane === 'builder' ? ' is-on' : ''}`} onClick={() => switchLane('builder')}>{t('remote.lane.builder')}</button>
                <button type="button" className={`remote__lane${lane === 'ask' ? ' is-on' : ''}`} onClick={() => switchLane('ask')}>{t('remote.lane.ask')}</button>
              </span>
            )}
          </div>
          {target.kind === 'agent' && (
            <div className="remote__sofarow">
              {/* Sofa view (openspec sofa-mode): the dock's ⤢ + split 30 / 70 with the pushed app, in one tap;
                  the state comes from the projector's heartbeat, so the button tells the truth. */}
              <button type="button" className={`remote__sofa${sofaOn(liveScreens) ? ' is-on' : ''}`} onClick={() => cmd('layout', { mode: sofaOn(liveScreens) ? 'normal' : 'sofa', agent: target.repoId })}>
                🛋 {sofaOn(liveScreens) ? t('remote.sofaOn') : t('remote.sofa')}
              </button>
              {target.sourceId === 'self' && appsOf(repos, target.repoId).length > 0 && (
                <div className="remote__apps" aria-label={t('remote.apps')}>
                  <span className="remote__appslabel">{t('remote.apps')}</span>
                  {appsOf(repos, target.repoId).map((a) => (
                    <button key={a.id} type="button" className="remote__app" onClick={() => cmd('push-app', { app: a.id, agent: target.repoId })}>{a.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {question && (
            <div className="remote__question">
              {question.header && <span className="remote__qtag">{question.header}</span>}
              <div className="remote__qtext">{question.question}</div>
              {question.options.map((o) => (
                <button key={o.label} type="button" className="remote__opt" onClick={() => answer(o.label)} disabled={sending}>
                  <b>{o.label}</b>{o.description && <small>{o.description}</small>}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="remote__compose"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('remote.placeholder').replace('{who}', label)}
            disabled={sending}
          />
          <div className="remote__sendrow">
            <button type="button" className="remote__btn remote__btn--primary" onClick={() => send()} disabled={sending || !text.trim()}>
              {sending ? t('remote.sending') : t('remote.send')}
            </button>
            <button type="button" className="remote__btn remote__btn--danger" onClick={stopRun} disabled={!running && target.kind === 'agent'}>{t('remote.stop')}</button>
            <span className={`remote__state${running ? ' is-running' : ''}`}>{running ? t('remote.running') : t('remote.idle')}</span>
          </div>
          {peek && (
            <div className={`remote__peek${peekOpen ? ' is-open' : ''}`}>
              <button type="button" className="remote__peektoggle" onClick={() => setPeekOpen((o) => !o)}>
                {peekOpen ? '▾' : '▸'} {t('remote.peek')}
              </button>
              {peekOpen && <div className="remote__peektext">{peek.text.replace(/\*\*|`/g, '')}</div>}
            </div>
          )}
        </section>
      )}

      {/* The agents, grouped by machine (openspec remote-fleet-agents): this harness first, then each peer. */}
      {groups.map((g) => (
        <section key={g.sourceId} className={`remote__machine${g.reachable ? '' : ' is-dark'}${screenOn === g.sourceId ? ' is-screen' : ''}`} data-source={g.sourceId}>
          {(groups.length > 1 || g.machine) && (
            <h2 className="remote__machinehead">
              <span className="remote__machinename">{g.self ? (g.machine || t('remote.thisHarness')) : g.machine}</span>
              {g.self && <small className="remote__machinetag">{t('remote.thisHarness')}</small>}
              {!g.reachable && <small className="remote__machinetag remote__machinetag--dark">{t('remote.dark')}</small>}
              {screenOn === g.sourceId && screenOn !== 'self' && <small className="remote__machinetag remote__machinetag--screen">📺</small>}
            </h2>
          )}
          <ul className="remote__agents">
            {g.agents.map((a) => (
              <li key={a.key}>
                <button type="button" className={`remote__agent${onAgent(a) ? ' is-on' : ''}`} onClick={() => tapAgent(g, a)} disabled={!g.reachable} data-source={a.sourceId} data-repo={a.repoId}>
                  <i className="remote__dot" style={{ background: a.color || (g.self ? '#999' : '#b7a98f') }} />
                  <b>{a.name}</b>
                  {a.badge && <small className={`remote__badge remote__badge--${a.badge}`}>{t(`remote.badge.${a.badge}`)}</small>}
                </button>
              </li>
            ))}
            {!g.agents.length && <li className="remote__empty">{g.self ? t('remote.noAgents') : t('remote.noPeerAgents')}</li>}
          </ul>
        </section>
      ))}

      <div className="remote__ctl">
        <button type="button" className="remote__btn" onClick={() => cmd('scroll', { dir: 'up' })} aria-label={t('remote.pageUp')}>▲</button>
        <button type="button" className="remote__btn" onClick={() => cmd('scroll', { dir: 'down' })} aria-label={t('remote.pageDown')}>▼</button>
        <button type="button" className="remote__btn" onClick={() => cmd('scroll', { dir: 'latest' })}>{t('remote.latest')}</button>
        <button type="button" className="remote__btn" onClick={() => cmd('zoom', { dir: 'out' })} aria-label={t('remote.zoomOut')}>A−</button>
        <button type="button" className="remote__btn" onClick={() => cmd('zoom', { dir: 'in' })} aria-label={t('remote.zoomIn')}>A+</button>
      </div>

      {notice && <div className="remote__notice" role="status">{notice}</div>}
    </div>
  );
}
