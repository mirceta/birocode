import { useEffect, useMemo, useState } from 'react';
import ActivitySteps from './ActivitySteps';
import { apiGet } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';

// Tool calls drawer (openspec: add-tool-call-history). A slide-in panel that
// lists every tool call the agent made in the ACTIVE conversation, in order,
// each row expandable to its full input/output.
//
// It is fed by two sources, merged by tool id so the list is complete whether
// the turn is live, reattached, or fully historical:
//   - live:   the conversation's streaming `steps` (ChatContext.liveToolCalls)
//   - durable: GET /sessions/{id}/tools, reconstructed from the JSONL transcript
//             (the message transcript strips tool blocks, so this fills the gap
//             after a reload / reattach).
// Rows reuse ActivitySteps so they look exactly like the inline tool steps.
export default function ToolCallsPanel({ open, onClose }) {
  const { t } = useT();
  const { liveToolCalls, activeRepoId, sessionId, streaming } = useChat();
  const [fetched, setFetched] = useState([]);

  // Pull the durable history from disk whenever the panel opens or the
  // conversation changes; refetch when a turn ends (streaming flips) so the
  // list reconciles with what was just written to the transcript.
  useEffect(() => {
    if (!open || !sessionId) {
      setFetched([]);
      return;
    }
    let cancelled = false;
    apiGet(`/sessions/${sessionId}/tools`, { repoId: activeRepoId })
      .then((d) => { if (!cancelled) setFetched(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setFetched([]); });
    return () => { cancelled = true; };
  }, [open, sessionId, activeRepoId, streaming]);

  // Merge by id: transcript order first, live overlaid (it's fresher — carries
  // the running spinner and the latest result), then any live-only calls that
  // the transcript hasn't caught up to yet.
  const steps = useMemo(() => {
    const liveById = new Map(liveToolCalls.map((c) => [c.id, c]));
    const merged = [];
    const seen = new Set();
    for (const f of fetched) {
      const live = liveById.get(f.id);
      merged.push(live ? { ...f, ...live } : f);
      seen.add(f.id);
    }
    for (const c of liveToolCalls) if (!seen.has(c.id)) merged.push(c);

    return merged.map((c) => ({
      kind: 'tool',
      id: c.id,
      name: c.name,
      summary: c.summary,
      detail: c.detail,
      preview: c.preview,
      // ok null/undefined = no result yet → render as still running.
      status: c.ok === null || c.ok === undefined ? 'running' : c.ok ? 'done' : 'error',
      ok: c.ok !== false,
      startedAt: c.startedAt,
    }));
  }, [fetched, liveToolCalls]);

  if (!open) return null;

  return (
    <>
      <div className="toolcalls__backdrop" onClick={onClose} />
      <aside className="toolcalls" role="dialog" aria-label={t('chat.toolCalls')}>
        <div className="toolcalls__head">
          <span className="toolcalls__title">
            {t('chat.toolCalls')}
            {steps.length > 0 && <span className="toolcalls__count">{steps.length}</span>}
          </span>
          <button
            type="button"
            className="toolcalls__close"
            onClick={onClose}
            aria-label={t('chat.toolCallsClose')}
            title={t('chat.toolCallsClose')}
          >
            ✕
          </button>
        </div>
        <div className="toolcalls__body">
          {steps.length === 0 ? (
            <p className="toolcalls__empty">{t('chat.toolCallsEmpty')}</p>
          ) : (
            <ActivitySteps steps={steps} />
          )}
        </div>
      </aside>
    </>
  );
}
