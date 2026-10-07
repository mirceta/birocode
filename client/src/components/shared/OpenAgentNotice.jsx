import { useEffect, useState } from 'react';
import { OPEN_AGENT_EVENT } from './agentLink';
import { openNoticeText } from '../../manage/openNotice';

// What happened after "open harness", wherever it was clicked (openspec status-open-agent-anywhere,
// widened by open-agent-everywhere): the opener announces every outcome on the window; this line
// shows the latest. Quiet outcomes fade; the ones where the agent's tab may not have come to the
// front — or could not be opened at all (unreachable machine, unknown agent, no fleet yet) — stay,
// with a real link that opens a fresh tab when there is a URL. Mounted ONCE per page (the first
// instance wins), so a surface may include it without doubling the line.
let mounted = 0;
export default function OpenAgentNotice({ compact = false }) {
  const [n, setN] = useState(null);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (mounted > 0) return undefined;
    mounted += 1; setOwner(true);
    const on = (e) => setN({ ...(e.detail || {}), at: Date.now() });
    window.addEventListener(OPEN_AGENT_EVENT, on);
    return () => { window.removeEventListener(OPEN_AGENT_EVENT, on); mounted -= 1; };
  }, []);
  const view = n ? openNoticeText(n) : null;
  useEffect(() => {
    if (!n || !view || view.sticky) return undefined;
    const t = setTimeout(() => setN(null), 7000);
    return () => clearTimeout(t);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!owner || !n || !view) return null;
  return (
    <div className={`fs__note fs__open-notice${view.sticky ? ' fs__note--warn' : ''}${compact ? ' fs__open-notice--compact' : ''}`} role="status" data-open-notice={n.result} data-open-notice-agent={n.key || ''}>
      <span>{view.text}</span>
      {view.link && n.url && <a className="fs__open-notice-link" href={n.url} target="_blank" rel="noopener" onClick={() => setN(null)} data-open-notice-link>open {n.label || 'the agent'} in a new tab ↗</a>}
      <button type="button" className="fs__open-notice-x" onClick={() => setN(null)} aria-label="Dismiss" title="Dismiss">×</button>
    </div>
  );
}
