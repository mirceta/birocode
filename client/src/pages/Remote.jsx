// The phone remote (openspec sofa-mode, design D3): a plain web page fitted for a phone — not a PWA —
// that pairs once with the PIN shown on the big screen, lists the agents with their badges, tells the
// big screen what to open (open-agent / open-view / scroll / zoom / lane), writes to the opened agent
// (or the arch) through the same POST /api/chat every composer uses, stops a run, peeks at the last
// reply and mirrors an open AskUserQuestion as buttons. Every part but the big-screen commands works
// with no screen listening at all — the page is also "message my agents from anywhere".
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { REMOTE_VIEWS, badgeOf, chatBody, cleanPin, lastReply, openQuestion, showingLine, targetLabel } from '../components/remote/remoteModel.js';
import './remote.css';

function PairScreen({ onUnlock }) {
  const { t } = useT();
  const [pin, setPin] = useState('');
  const [state, setState] = useState(''); // '' | busy | wrong | locked | error
  const submit = async (e) => {
    e?.preventDefault();
    if (pin.length !== 6) return;
    setState('busy');
    try {
      const res = await fetch('/api/remote/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      if (res.ok) { onUnlock(); return; }
      setState(res.status === 429 ? 'locked' : res.status === 401 ? 'wrong' : 'error');
    } catch { setState('error'); }
    setPin('');
  };
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
      {state === 'wrong' && <p className="remote__err">{t('remote.pairWrong')}</p>}
      {state === 'locked' && <p className="remote__err">{t('remote.pairLocked')}</p>}
      {state === 'error' && <p className="remote__err">{t('remote.pairError')}</p>}
      <p className="remote__hint">{t('remote.pairHint')}</p>
    </form>
  );
}

export default function Remote({ unlocked, onUnlock }) {
  const { t } = useT();
  if (!unlocked) return <PairScreen onUnlock={onUnlock} />;
  return <RemotePanel t={t} />;
}

function RemotePanel({ t }) {
  const [screens, setScreens] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [target, setTarget] = useState(null); // { kind: 'agent', tabId, repoId, name, sessionId } | { kind: 'arch' }
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

  // Polls: the screens (3 s), the dock (5 s), the opened conversation (4 s).
  useEffect(() => {
    let stop = false;
    const screensPoll = () => apiGet('/remote/screens').then((s) => { if (!stop) setScreens(Array.isArray(s) ? s : []); }).catch(() => { if (!stop) setScreens([]); });
    const dockPoll = () => apiGet('/dock').then((d) => { if (!stop) setTabs(Array.isArray(d) ? d : []); }).catch(() => {});
    screensPoll(); dockPoll();
    const a = setInterval(screensPoll, 3000);
    const b = setInterval(dockPoll, 5000);
    return () => { stop = true; clearInterval(a); clearInterval(b); };
  }, []);
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
      const tab = tabs.find((x) => x.id === tg.tabId);
      const sessionId = tab?.sessionId || tg.sessionId;
      if (!sessionId) { setPeek(null); setQuestion(null); return; }
      const [messages, tools] = await Promise.all([
        apiGet(`/sessions/${encodeURIComponent(sessionId)}/messages`, { repoId: tg.repoId }),
        apiGet(`/sessions/${encodeURIComponent(sessionId)}/tools`, { repoId: tg.repoId }).catch(() => []),
      ]);
      setPeek(lastReply(messages));
      const q = openQuestion(tools, messages);
      setQuestion(q && answered !== q.question ? q : null);
    } catch { /* keep what we have */ }
  }, [tabs, answered]);
  useEffect(() => {
    refreshConversation();
    const id = setInterval(refreshConversation, 4000);
    return () => clearInterval(id);
  }, [refreshConversation]);

  const cmd = useCallback(async (type, args = {}) => {
    try { await apiPost('/remote/commands', { type, args }); }
    catch (e) { setNotice(e?.status === 401 ? t('remote.sessionLost') : t('remote.cmdFailed')); }
  }, [t]);

  const tapAgent = (tab) => {
    setTarget({ kind: 'agent', tabId: tab.id, repoId: tab.repoId, name: tab.repoName, sessionId: tab.sessionId });
    setAnswered(''); setPeekOpen(false); setNotice('');
    cmd('open-agent', { repoId: tab.repoId });
  };
  const tapView = (view) => {
    if (view === 'arch') { setTarget({ kind: 'arch' }); setAnswered(''); setPeekOpen(false); }
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
        const tab = tabs.find((x) => x.id === tg.tabId);
        // POST /api/chat answers with the run's SSE stream; the run is detached on the server, so the
        // phone only needs the status line — it drops the body and lets the projector's dock stream.
        const res = await fetch('/api/chat', {
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
      setNotice(e?.status === 409 ? t('remote.busy') : e?.status === 401 ? t('remote.sessionLost') : t('remote.sendFailed'));
    } finally { setSending(false); }
  };
  const answer = (label) => { setAnswered(question?.question || ''); setQuestion(null); send(label); };
  const stopRun = async () => {
    const tg = targetRef.current;
    if (!tg) return;
    try {
      if (tg.kind === 'arch') await apiPost('/arch/stop-turn');
      else await apiPost(`/chat/stop?lane=${laneRef.current}`, undefined, { repoId: tg.repoId });
      setNotice(t('remote.stopped'));
    } catch { setNotice(t('remote.cmdFailed')); }
  };

  const showing = showingLine(screens);
  const targetTab = target?.kind === 'agent' ? tabs.find((x) => x.id === target.tabId) : null;
  const running = targetTab?.status === 'running';
  const label = targetLabel(target, t);

  return (
    <div className="remote">
      <header className="remote__head">
        <div className="remote__title">📺 {t('remote.title')}</div>
        <div className={`remote__showing${showing ? '' : ' remote__showing--none'}`}>
          {showing ? t('remote.showing').replace('{what}', showing) : t('remote.noScreen')}
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
            <span>{t('remote.writeTo').replace('{who}', label)}</span>
            {target.kind === 'agent' && (
              <span className="remote__lanes">
                <button type="button" className={`remote__lane${lane === 'builder' ? ' is-on' : ''}`} onClick={() => switchLane('builder')}>{t('remote.lane.builder')}</button>
                <button type="button" className={`remote__lane${lane === 'ask' ? ' is-on' : ''}`} onClick={() => switchLane('ask')}>{t('remote.lane.ask')}</button>
              </span>
            )}
          </div>
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

      <ul className="remote__agents">
        {tabs.map((tab) => {
          const badge = badgeOf(tab);
          const on = target?.kind === 'agent' && target.tabId === tab.id;
          return (
            <li key={tab.id}>
              <button type="button" className={`remote__agent${on ? ' is-on' : ''}`} onClick={() => tapAgent(tab)}>
                <i className="remote__dot" style={{ background: tab.color || '#999' }} />
                <b>{tab.repoName}</b>
                {badge && <small className={`remote__badge remote__badge--${badge}`}>{t(`remote.badge.${badge}`)}</small>}
              </button>
            </li>
          );
        })}
        {!tabs.length && <li className="remote__empty">{t('remote.noAgents')}</li>}
      </ul>

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
