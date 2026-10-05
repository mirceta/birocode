import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { ago } from '../components/taskgraph/cardSections';
import './agentRequests.css';

// The Repo Agent Requests tab (openspec repo-agent-requests): every request a repo agent sent
// UP to its arch with request_arch — the ones recorded on this hub and the ones pulled from
// managed peers — pending first with Approve / Dismiss, then the decided ones. Approve posts
// the request into the arch's conversation (now, or on the next engine tick when the arch is
// mid-turn); Dismiss closes it and the arch never sees it. Each peer's last pull is named, a
// dark peer is shown with its status, not hidden. The how-to's phrasings come from the harness
// (GET /api/arch/requests → howTo), so they never drift from the tool.

const POLL_MS = 5000;

function Row({ r, now, busy, onApprove, onDismiss, t }) {
  const pending = r.status === 'pending';
  const [open, setOpen] = useState(pending);
  const long = (r.text || '').length > 280;
  const text = open || !long ? r.text : `${r.text.slice(0, 280)}…`;
  return (
    <article className={`rq__card rq__card--${r.status}`} data-rq-card={r.id} data-rq-status={r.status}>
      <header className="rq__head">
        <span className="rq__agent" title={r.repoId}>{r.machine}/{r.agent}</span>
        {r.title && <span className="rq__title" data-rq-title={r.id}>{r.title}</span>}
        <span className="rq__when" title={new Date(r.createdAt).toLocaleString()}>{ago(now - r.createdAt)} {t('rq.ago')}</span>
        <span className={`rq__status rq__status--${r.status}`} data-rq-badge={r.id}>
          {t(`rq.status.${r.status}`)}
          {r.status === 'approved' && (r.deliveredAt ? ` · ${t('rq.delivered')}` : ` · ${t('rq.waiting')}`)}
        </span>
      </header>
      <pre className="rq__text" data-rq-text={r.id}>{text}</pre>
      {long && <button type="button" className="rq__more" onClick={() => setOpen((v) => !v)}>{open ? t('rq.less') : t('rq.more')}</button>}
      <footer className="rq__foot">
        {pending ? (
          <>
            <button type="button" className="rq__btn rq__btn--approve" disabled={busy} onClick={() => onApprove(r)} data-rq-approve={r.id}>{t('rq.approve')}</button>
            <button type="button" className="rq__btn rq__btn--dismiss" disabled={busy} onClick={() => onDismiss(r)} data-rq-dismiss={r.id}>{t('rq.dismiss')}</button>
            <span className="rq__hint">{t('rq.pendingHint')}</span>
          </>
        ) : (
          <span className="rq__hint">
            {t('rq.decidedBy', { who: r.decidedBy || '?', when: r.decidedAt ? `${ago(now - r.decidedAt)} ${t('rq.ago')}` : '' })}
            {r.sourceId && !r.decisionSynced && ` · ${t('rq.notSynced')}`}
          </span>
        )}
      </footer>
    </article>
  );
}

export default function AgentRequests() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showDecided, setShowDecided] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/arch/requests');
      setData(d);
      setError(null);
      setNow(Date.now());
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const decide = async (r, action) => {
    setBusy(r.id);
    try {
      await apiPost(`/arch/requests/${encodeURIComponent(r.id)}/${action}`, {});
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  if (!data && !error) return <div className="mg__status rq"><div className="rq__sec">{t('rq.loading')}</div></div>;
  const requests = data?.requests || [];
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');
  const peers = data?.peers || [];
  const howTo = data?.howTo;

  return (
    <div className="mg__status rq" data-rq-root>
      <section className="rq__sec">
        <div className="rq__headline">
          <h2 className="rq__h">{t('rq.title', { hub: data?.hub || '' })}</h2>
          <span className="rq__count" data-rq-pending-count>{t('rq.pendingCount', { n: pending.length })}</span>
        </div>
        <p className="rq__lead">{t('rq.lead')}</p>
        {error && <div className="rq__err" data-rq-error>{error}</div>}
        {data && data.available === false && <div className="rq__err">{t('rq.unavailable')}</div>}
        {data && data.gateOpen === false && <div className="rq__warn" data-rq-gate-closed>{t('rq.gateClosed')}</div>}
        {pending.length === 0
          ? <div className="rq__empty" data-rq-empty>{t('rq.none')}</div>
          : pending.map((r) => (
            <Row key={r.id} r={r} now={now} busy={busy === r.id} t={t}
              onApprove={(x) => decide(x, 'approve')} onDismiss={(x) => setConfirm(x)} />
          ))}
      </section>

      {confirm && (
        <div className="rq__modal" role="dialog" data-rq-confirm>
          <div className="rq__modal-box">
            <p>{t('rq.confirmDismiss', { who: `${confirm.machine}/${confirm.agent}` })}</p>
            <pre className="rq__text">{confirm.title || confirm.text.slice(0, 200)}</pre>
            <div className="rq__modal-actions">
              <button type="button" className="rq__btn rq__btn--dismiss" onClick={() => decide(confirm, 'dismiss')} data-rq-confirm-dismiss>{t('rq.dismissNow')}</button>
              <button type="button" className="rq__btn" onClick={() => setConfirm(null)} data-rq-confirm-cancel>{t('rq.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      <section className="rq__sec">
        <h3 className="rq__h3">
          <button type="button" className="rq__toggle" onClick={() => setShowDecided((v) => !v)} data-rq-toggle-decided>
            {showDecided ? '▾' : '▸'} {t('rq.decided', { n: decided.length })}
          </button>
        </h3>
        {showDecided && (decided.length === 0
          ? <div className="rq__empty">{t('rq.noneDecided')}</div>
          : decided.map((r) => <Row key={r.id} r={r} now={now} busy={false} t={t} onApprove={() => {}} onDismiss={() => {}} />))}
      </section>

      <section className="rq__sec">
        <h3 className="rq__h3">{t('rq.peers')}</h3>
        {peers.length === 0
          ? <div className="rq__dim">{t('rq.noPeers')}</div>
          : (
            <ul className="rq__peers" data-rq-peers>
              {peers.map((p) => (
                <li key={p.sourceId} className={`rq__peer rq__peer--${p.status === 'ok' ? 'ok' : 'bad'}`} data-rq-peer={p.machine} data-rq-peer-status={p.status}>
                  <b>{p.machine}</b> · {p.status === 'ok' ? p.detail : `${p.status}${p.detail ? ` — ${p.detail}` : ''}`}
                  {!p.managed && <span className="rq__dim"> · {t('rq.peerUnmanaged')}</span>}
                  {!p.allowSends && <span className="rq__dim"> · {t('rq.peerNoSends')}</span>}
                </li>
              ))}
            </ul>
          )}
        {data?.pulledAt > 0 && <div className="rq__dim">{t('rq.pulledAt', { when: `${ago(now - data.pulledAt)} ${t('rq.ago')}` })}</div>}
      </section>

      {howTo && (
        <section className="rq__sec rq__how" data-rq-howto>
          <h3 className="rq__h3">{t('rq.howTitle')}</h3>
          <h4>{t('rq.howAgent', { tool: howTo.tool })}</h4>
          <ul>{(howTo.agent || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
          <h4>{t('rq.howOperator')}</h4>
          <ul>{(howTo.operatorSteps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
