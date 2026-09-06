import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import ScoreboardView, { ScoreboardWindows } from '../components/dashboard/ScoreboardView';

// The Fleet Status Scoreboard tab (openspec fleet-status-panels): loaded ON DEMAND —
// one GET to the hub's relay (GET /api/arch/fleet/scoreboard?sourceId=&window=), which
// serves this box locally or relays a peer's, cached a few minutes on the hub. Never in
// the periodic fleet poll (the analytics fold re-reads the whole activity ledger). A
// short per-(machine,window) client cache keeps tab flips instant; a Refresh button
// forces a fresh fetch. Renders the identical ScoreboardView the harness's own header
// Scoreboard uses.
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map(); // `${sourceId}|${window}` -> { data, at }

export default function FleetScoreboardTab({ machine }) {
  const { t } = useT();
  const [window, setWindow] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const sourceId = machine?.sourceId || '';

  const load = useCallback(async (win, force) => {
    const key = `${sourceId}|${win}`;
    if (!force) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) { setData(hit.data); setError(''); return; }
    }
    setLoading(true);
    setError('');
    try {
      const r = await apiGet(`/arch/fleet/scoreboard?sourceId=${encodeURIComponent(sourceId)}&window=${encodeURIComponent(win)}`);
      if (!alive.current) return;
      if (r && r.ok && r.data) {
        cache.set(key, { data: r.data, at: Date.now() });
        setData(r.data);
      } else {
        setData(null);
        setError(r?.error || 'the machine did not answer');
      }
    } catch (e) {
      if (alive.current) { setData(null); setError(e?.message || String(e)); }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => { load(window, false); }, [load, window]);

  return (
    <div className="fs__scoreboard" data-fleet-scoreboard={sourceId}>
      <div className="fs__sb-bar">
        <ScoreboardWindows window={window} onWindow={setWindow} t={t} />
        <button
          type="button"
          className="fs__btn"
          onClick={() => load(window, true)}
          disabled={loading}
          data-sb-refresh
          title="Fetch this machine's scoreboard again"
        >
          {loading ? '… loading' : '↻ refresh'}
        </button>
      </div>
      {loading && !data && <div className="fs__note" data-sb-loading>Loading the scoreboard…</div>}
      {error && !data && <div className="fs__note fs__note--err" data-sb-error>{error}</div>}
      {data && <ScoreboardView data={data} window={window} t={t} />}
    </div>
  );
}
