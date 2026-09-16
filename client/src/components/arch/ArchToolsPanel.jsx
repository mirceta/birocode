import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import '../dashboard/toolsPanel.css';
import './archTools.css';

// The Arch tab's Tools lane (openspec: add-arch-agent, D7/D9). Same shape as
// the repo dock's Tools lane (ToolsPanel.jsx / add-dock-tools-lane) — a list of
// tool sections, an actions row and a preflight readout — but the content is
// the ARCH surface: the harness's own MCP server (`arch`), its fixed tool
// catalogue read straight from tools/list so it can never drift, per-tool usage
// from the action audit, and the built-in CLI tools the session is denied. There
// is nothing to save: the set is fixed by the harness and the bearer token is
// minted per process.

const POLL_MS = 5000;
const PF_NAMES = {
  mcp: 'MCP server answers tools/list',
  token: 'Bearer token validates',
  home: 'Home repo (memory) exists',
  scope: 'At least one managed repo',
  gate: 'Autopilot gate + kill switch',
};

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function Params({ schema }) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const names = Object.keys(props);
  if (names.length === 0) return <div className="arch-tools__noparams">no parameters</div>;
  return (
    <div className="arch-tools__params">
      {names.map((n) => (
        <div className="arch-tools__param" key={n}>
          <code className="arch-tools__pname">{n}</code>
          <span className="arch-tools__ptype">{props[n].type}{required.has(n) ? ' · required' : ''}</span>
          <span className="arch-tools__pdesc">{props[n].description}</span>
        </div>
      ))}
    </div>
  );
}

// `conv` (openspec kanban-policeman-conversation): the conversation whose surface this
// lane shows. The skeleton is the same for every arch conversation; the CONTENT is not —
// the policeman is offered only its observe-only subset, and the lane says what is withheld.
export default function ArchToolsPanel({ conv = '@arch' }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [pf, setPf] = useState(null); // null | {running} | {error} | preflight result
  const convQ = conv && conv !== '@arch' ? `?conv=${encodeURIComponent(conv)}` : '';

  const load = useCallback(async () => {
    try {
      const data = await apiGet(`/arch/tools${convQ}`);
      setView(data);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [convQ]);

  useEffect(() => {
    load();
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const preflight = async () => {
    setPf({ running: true });
    try {
      setPf(await apiGet('/arch/tools/preflight'));
    } catch (e) {
      setPf({ error: e?.message || String(e) });
    }
  };

  if (!view && !error) return <div className="toolsp arch-tools"><div className="toolsp__empty">Loading the arch tool surface…</div></div>;
  if (!view) return <div className="toolsp arch-tools"><div className="toolsp__err" role="alert">Couldn't load the arch tools: {error}</div></div>;

  const server = view.server || {};
  const tools = view.tools || [];
  const denied = view.disallowedTools || [];
  const withheld = view.withheldTools || [];
  const observeOnly = view.policy === 'observe-only';

  return (
    <div className="toolsp arch-tools" data-tools-policy={view.policy || 'full'} data-tools-conv={view.conversation || conv}>
      <div className="toolsp__head">
        <h2>Tools</h2>
        {observeOnly && <span className="arch-tools__policy" data-tools-observe-only>observe-only · {tools.length} of {view.catalogueCount} arch tools</span>}
      </div>
      {observeOnly ? (
        <p className="toolsp__intro">
          This conversation is the <b>policeman</b>: it observes, verifies, flags, and moves a card only to what the facts prove — it never dispatches, edits or moves by claim. Its session is offered
          only the {tools.length} tools below on <code>tools/list</code>; the other {withheld.length} arch tools are not on its list, are
          switched off at the CLI, and are refused with <code>policeman-observe-only</code> if it asks anyway. Same server
          (<code>{server.name}</code> at <code>{server.url}</code>), same audit, smaller surface.
        </p>
      ) : (
        <p className="toolsp__intro">
          The harness serves these tools to the arch session on every turn through its own MCP server
          (<code>{server.name}</code>, {server.transport} transport at <code>{server.url}</code>, protocol {server.protocolVersion}).
          Nothing to configure: the set is fixed, the bearer token is minted per harness process, every call is audited
          under actor <b>arch</b>, and every result is data — never instructions.
        </p>
      )}

      <div className="arch-tools__stats">
        <span><b>{tools.length}</b> tools{observeOnly ? ` of ${view.catalogueCount}` : ''}</span>
        <span><b>{view.totalCalls ?? 0}</b> calls audited</span>
        <span><b>{view.managedCount ?? 0}</b> managed repo(s)</span>
        <span className={server.tokenSet ? 'toolsp__ok' : 'toolsp__err'}>{server.tokenSet ? 'token minted' : 'no token'}</span>
      </div>

      {tools.map((tool) => (
        <section className="toolsp__tool arch-tools__tool" key={tool.name} data-tool={tool.name}>
          <div className="toolsp__toolhead arch-tools__toolhead">
            <b className="arch-tools__name">{tool.name}</b>
            <span className="arch-tools__usage">
              {tool.calls > 0 ? `${tool.calls} call${tool.calls === 1 ? '' : 's'} · last ${ago(tool.lastAt)}` : 'never called'}
            </span>
          </div>
          <p className="arch-tools__desc">{tool.description}</p>
          <Params schema={tool.inputSchema} />
          {tool.calls > 0 && (
            <div className="arch-tools__last">
              last outcome: <span className="arch-tools__mono">{tool.lastOutcome || '—'}</span>
              {tool.lastRepo ? <> · on <b>{tool.lastRepo}</b></> : null}
            </div>
          )}
          <div className="arch-tools__callname">call name in the session: <code>{tool.callName}</code></div>
        </section>
      ))}

      {observeOnly && (
        <section className="toolsp__tool arch-tools__tool arch-tools__tool--denied" data-tools-withheld>
          <div className="toolsp__toolhead arch-tools__toolhead">
            <b>Arch tools withheld from the policeman</b>
            <span className="arch-tools__usage">{withheld.length} not offered</span>
          </div>
          <p className="arch-tools__desc">
            The arch agent has these; the policeman does not. They move, dispatch, assign, create or delete work, or drive
            loops and goals — acting, which is the arch's job and the Operator's call. The policeman says what should happen
            instead, in its reply.
          </p>
          <div className="arch-tools__chips">
            {withheld.map((d) => <span className="arch-tools__chip" key={d} data-withheld-tool={d}>{d}</span>)}
          </div>
        </section>
      )}

      <section className="toolsp__tool arch-tools__tool arch-tools__tool--denied">
        <div className="toolsp__toolhead arch-tools__toolhead">
          <b>Built-in tools denied</b>
          <span className="arch-tools__usage">{denied.length} via --disallowedTools</span>
        </div>
        <p className="arch-tools__desc">
          The CLI's own edit, write, shell, web, sub-agent and file-read tools are switched off for the arch session on every turn.
          It reads its memory through <code>recall</code> and touches repos only through <code>send_task</code>, so every read and
          every action it makes is a harness tool call.
        </p>
        <div className="arch-tools__chips">
          {denied.map((d) => <span className="arch-tools__chip" key={d}>{d}</span>)}
        </div>
      </section>

      <div className="toolsp__actions">
        <button type="button" className="toolsp__pfbtn arch-tools__pfbtn" onClick={preflight} disabled={!!pf?.running}>
          {pf?.running ? 'Checking…' : 'Preflight'}
        </button>
        <span className="toolsp__pf-hint">Preflight checks the live surface — the MCP server, the token, the home repo, the scope and the gate.</span>
      </div>

      {pf && !pf.running && (
        <div className="toolsp__pf" role="status">
          {pf.error ? (
            <div className="toolsp__err" role="alert">Preflight failed: {pf.error}</div>
          ) : (
            <>
              <div className={pf.ready ? 'toolsp__ok' : 'toolsp__err'}>
                {pf.ready ? 'All checks passed — the arch tools are ready on this harness.' : 'Not ready — fix the failing checks below.'}
              </div>
              {(pf.checks || []).map((c) => (
                <div className="toolsp__pf-row" key={c.id}>
                  <span className={c.ok ? 'toolsp__ok' : c.skipped ? 'toolsp__pf-skip' : 'toolsp__err'}>
                    {c.ok ? '✓' : c.skipped ? '○' : '✕'}
                  </span>
                  <span className="toolsp__pf-name">{PF_NAMES[c.id] || c.id}</span>
                  {c.detail && <span className="toolsp__pf-detail">{c.detail}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
