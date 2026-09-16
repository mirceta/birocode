import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './handover.css';

// Branch hand-over control (openspec arch-branch-handover): the repo agent's dock
// shows whose the current branch is — claimed by the Operator (human-active /
// pinned), the arch's (asked for, handed over, or a task branch), or free on the
// default branch — and lets the Operator hand the branch to the arch ("Hand to
// arch") or take it back, and pin the repo as theirs. One POST /api/arch/handover
// per click; the posture is re-read from GET /api/arch/claim, which is also polled
// so a branch switch in the agent shows up without a reload.
//
// `sourceId` targets a repo on another machine (the Management App's Status
// card): the hub relays adopt / revoke to that peer; pin stays local-only.

const POLL_MS = 8000;

export function describePosture(p, t) {
  if (!p) return '';
  if (!p.managed) return t('handover.notManaged');
  if (p.availability === 'busy') return t('handover.busy');
  if (p.onDefault) return t('handover.onDefault');
  if (p.pinned) return t('handover.pinned');
  if (p.availability === 'claimed') return t('handover.claimedHuman', { window: p.claimWindowMinutes >= 60 ? `${Math.round(p.claimWindowMinutes / 60)} h` : `${p.claimWindowMinutes} min` });
  if (p.adopted) return t('handover.handed');
  if (p.archBranch) return t('handover.archBranch');
  if (p.claimedReason === 'unassigned-branch') return t('handover.unassigned');
  return '';
}

export default function HandToArch({ repoId, sourceId = null, initial = null, compact = false, onChanged }) {
  const { t } = useT();
  const [posture, setPosture] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const local = !sourceId || sourceId === 'self';
  const load = useCallback(async () => {
    if (!local || !repoId) return;
    try {
      const p = await apiGet(`/arch/claim?repoId=${encodeURIComponent(repoId)}`);
      setPosture(p);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [repoId, local]);

  useEffect(() => {
    if (!local) return undefined;
    load();
    const tm = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(tm);
  }, [load, local]);

  const act = async (action) => {
    setBusy(true);
    try {
      const r = await apiPost('/arch/handover', { repoId, action, sourceId: local ? null : sourceId, branch: posture?.branch && posture.branch !== 'unknown' ? posture.branch : null });
      if (r?.posture && local) setPosture(r.posture);
      if (!r?.ok) setError(r?.detail || r?.status || 'failed');
      else setError('');
      onChanged?.(r);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const p = posture;
  const known = p?.branch && p.branch !== 'unknown';
  const canHand = p && p.managed && known && !p.onDefault && !p.adopted && !p.archBranch;
  const canTakeBack = p && p.managed && known && !p.onDefault && (p.adopted || p.archBranch);
  const text = describePosture(p, t);

  if (!p && !error) return null;
  return (
    <div className={`handover${compact ? ' handover--compact' : ''}`} data-handover={repoId} data-availability={p?.availability} data-claimed-reason={p?.claimedReason || ''}>
      <span className="handover__text" title={known ? `⎇ ${p.branch}` : undefined}>
        <span className={`handover__dot handover__dot--${p?.pinned || p?.availability === 'claimed' ? 'claimed' : p?.onDefault || p?.adopted || p?.archBranch ? 'arch' : 'free'}`} aria-hidden="true" />
        {text}
      </span>
      <span className="handover__actions" role="group" aria-label={t('handover.group')}>
        {canHand && (
          <button type="button" className="handover__btn handover__btn--primary" disabled={busy} onClick={() => act('adopt')} data-handover-adopt title={t('handover.handTitle', { branch: p.branch })}>
            {t('handover.hand')}
          </button>
        )}
        {canTakeBack && (
          <button type="button" className="handover__btn" disabled={busy} onClick={() => act('revoke')} data-handover-revoke title={t('handover.takeBackTitle', { branch: p.branch })}>
            {t('handover.takeBack')}
          </button>
        )}
        {local && p?.managed && (
          <button type="button" className={`handover__btn${p.pinned ? ' handover__btn--on' : ''}`} disabled={busy} onClick={() => act(p.pinned ? 'unpin' : 'pin')} aria-pressed={!!p.pinned} data-handover-pin title={t('handover.pinTitle')}>
            {p.pinned ? t('handover.unpin') : t('handover.pin')}
          </button>
        )}
      </span>
      {error && <span className="handover__err" role="alert">{error}</span>}
    </div>
  );
}
