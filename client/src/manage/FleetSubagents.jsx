import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import AgentStatusDot from '../components/shared/AgentStatusDot';
import { subagentRow, subagentBadgeWord } from '../components/arch/subagentOwner';
import { subagentDot, subagentBadge, subagentTitle } from '../components/arch/subagents';
import { progressWord } from '../components/arch/goalPlan';

// The hub's view of REPO-AGENT subagents (openspec repo-agent-subagents), on the Management
// Subagents tab above the arch's own goal conversations: every agent of the fleet that runs (or
// ran) subagents, with its counts; open one to list its subagents (a peer's are read through its
// peer API on demand) and a subagent to read its step plan and last messages — readable from the
// hub the way an agent's main conversation is. Acting on them stays in that agent's dock lane.

const POLL_MS = 10000;

export default function FleetSubagents() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('manageapp.fleetSubagentsOpen') !== '0'; } catch { return true; } });
  const [agent, setAgent] = useState(null);       // { sourceId, repoId } opened
  const [list, setList] = useState(null);         // its subagents (views)
  const [pick, setPick] = useState(null);         // a subagent id
  const [detail, setDetail] = useState(null);     // { messages }
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setData(await apiGet('/arch/fleet/subagents')); setErr(''); } catch (e) { setErr(e?.message || String(e)); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const openAgent = async (a) => {
    const same = agent && agent.sourceId === a.sourceId && agent.repoId === a.repoId;
    setPick(null); setDetail(null);
    if (same) { setAgent(null); setList(null); return; }
    setAgent({ sourceId: a.sourceId, repoId: a.repoId });
    if (a.subagents) { setList(a.subagents); return; }
    setList(null);
    try {
      const r = await apiGet(`/arch/fleet/subagents?sourceId=${encodeURIComponent(a.sourceId)}&repoId=${encodeURIComponent(a.repoId)}`);
      setList(r?.data?.subagents || []);
      if (!r?.ok) setErr(r?.detail || r?.status || 'the machine did not answer');
    } catch (e) { setErr(e?.message || String(e)); }
  };
  const openSub = async (s) => {
    if (pick === s.id) { setPick(null); setDetail(null); return; }
    setPick(s.id); setDetail(null);
    try {
      const r = await apiGet(`/arch/fleet/subagents?sourceId=${encodeURIComponent(agent.sourceId)}&repoId=${encodeURIComponent(agent.repoId)}&id=${encodeURIComponent(s.id)}&tail=6`);
      setDetail(r?.data?.selected || { messages: [] });
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const agents = data?.agents || [];
  const running = agents.reduce((n, a) => n + (a.counts?.running || 0), 0);
  const toggle = () => setOpen((v) => { try { localStorage.setItem('manageapp.fleetSubagentsOpen', v ? '0' : '1'); } catch { /* private */ } return !v; });

  return (
    <div className="fsa" data-fleet-subagents={agents.length}>
      <button type="button" className="fsa__head" onClick={toggle} aria-expanded={open} data-fleet-subagents-toggle>
        <span>{open ? '▾' : '▸'} Repo-agent subagents</span>
        <span className="sa__dim" data-fleet-subagents-running={running}>{agents.length === 0 ? 'none' : `${running} running · ${agents.length} agent${agents.length === 1 ? '' : 's'}`}</span>
      </button>
      {open && (
        <div className="fsa__body">
          {err && <div className="sa__err">{err}</div>}
          {agents.length === 0 && <div className="sa__dim sa__pad">No repo agent runs subagents. An agent starts one with its start_subagent tool, or the Operator from that agent's dock (⑂ Subagents lane).</div>}
          {agents.map((a) => {
            const on = agent && agent.sourceId === a.sourceId && agent.repoId === a.repoId;
            return (
              <div key={a.key} className="fsa__agent" data-fleet-subagent-agent={a.handle}>
                <button type="button" className={`fsa__agent-row${on ? ' fsa__agent-row--on' : ''}`} onClick={() => openAgent(a)} title="List this agent's subagents">
                  <span className="fsa__agent-name">{a.handle}</span>
                  <span className={`fsa__count${a.counts?.needsHuman ? ' fsa__count--wait' : ''}`}>{subagentBadgeWord(a.counts)}</span>
                </button>
                {on && (
                  <div className="fsa__subs">
                    {list === null && <div className="sa__dim sa__pad">Loading…</div>}
                    {(list || []).map((s) => {
                      const row = subagentRow(s);
                      const dot = subagentDot(row);
                      return (
                        <div key={s.id}>
                          <button type="button" className={`fsa__sub${pick === s.id ? ' fsa__sub--on' : ''}`} onClick={() => openSub(s)} title={dot.label} data-fleet-subagent={s.id}>
                            <AgentStatusDot state={dot.state} title={dot.label} />
                            <span className="fsa__sub-title">{subagentTitle(row, 60)}</span>
                            <b className={`sa__badge sa__badge--${subagentBadge(row).replace(/\s+/g, '-')}`}>{subagentBadge(row)}</b>
                            {progressWord(s) && <span className="sa__dim">{progressWord(s)} steps</span>}
                          </button>
                          {pick === s.id && (
                            <div className="fsa__detail" data-fleet-subagent-detail={s.id}>
                              <ol className="fsa__plan">
                                {(s.plan || []).map((p) => <li key={p.index} className={`gp__step--${p.state}`}>{p.title} — <i>{p.state}</i>{p.evidence?.line ? ` · ${p.evidence.line}` : ''}</li>)}
                              </ol>
                              {detail === null ? <div className="sa__dim">Loading its last messages…</div>
                                : (detail.messages || []).map((m, i) => <div key={i} className={`fsa__msg fsa__msg--${m.role}`}><b>{m.role === 'assistant' ? 'subagent' : m.actor || 'prompt'}:</b> {(m.text || '').slice(0, 600)}</div>)}
                              <div className="sa__dim">Act on it from {a.handle}'s dock (⑂ Subagents lane).</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
