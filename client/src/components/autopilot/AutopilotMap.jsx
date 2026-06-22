import { useRef, useState } from 'react';
import ChatGraph from './ChatGraph';
import { AUTOPILOT_MAP, LOOP_FLOW } from './autopilotArchitectureData';

// The interactive "How autopilot works" map — sibling of ChatMap, embedded as real
// React code in the dock tab. Same self-contained dark stage and the same <ChatGraph>
// renderer; new content. Five internal views — Overview · System map · Step a loop
// (simulator) · Decision per turn · Safety fences — where "Step a loop" is a hands-on
// model of the deterministic loop decision (errored → done → escalate → capped → resend).

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'System map' },
  { id: 'loop', label: 'Step a loop' },
  { id: 'decision', label: 'Decision per turn' },
  { id: 'fences', label: 'Safety fences' },
];

const MAP_INTRO = 'The whole autopilot subsystem. Solid boxes are the five tiers (host PC · backend :5099 · CLI · disk · web UI); the dashed boxes inside the backend are its components. The one path IN is from the host — only the desktop window can open the gate. Hover a node to light up its connections, or click a box to read what it is and which file it maps to.';
const DECIDE_INTRO = 'The loop decision, in the exact order the code runs it. Four outcomes are terminal (the loop stops); only "resend" continues. Hover a step to isolate it; click for the exact code behaviour. Red arrows are the stop branches.';

// ───────────────────────────── Step-a-loop simulator ─────────────────────────────
// Models HandleLoop()'s deterministic check order. Arm a loop (cap 3), then say what
// the agent replied each turn; watch the loop resend, count iterations, and stop on
// done / escalate / capped / error — exactly as the Decision-per-turn graph shows.
const CAP = 3;
const SENTINEL = 'LOOP_DONE';

const REPLIES = [
  { key: 'work',  label: '…still working', sub: 'no sentinel, nothing risky', cls: 'work' },
  { key: 'done',  label: `…says “${SENTINEL}”`, sub: 'the agreed finish signal', cls: 'done' },
  { key: 'deny',  label: '…proposes to “deploy”', sub: 'a deny-listed word', cls: 'deny' },
  { key: 'error', label: 'run crashed (error)', sub: 'the run errored out', cls: 'error' },
];

const STATUS_TEXT = {
  idle: 'idle — not armed',
  looping: 'looping · resending',
  done: 'done ✓ (sentinel)',
  escalate: 'escalated — handed to you',
  capped: 'capped — hit the ceiling',
  error: 'error — run crashed',
};

function LoopSim() {
  const [gateOn, setGateOn] = useState(false);
  const [status, setStatus] = useState('idle');
  const [iters, setIters] = useState(0);
  const [log, setLog] = useState([]);
  const idRef = useRef(0);

  const addLog = (cls, msg) => setLog((prev) => [{ id: idRef.current++, cls, msg }, ...prev]);
  const looping = status === 'looping';
  const stopped = status !== 'idle' && status !== 'looping';

  const arm = () => {
    if (!gateOn) {
      addLog('sys', '· gate is OFF — the engine is inert. Open the operator gate first.');
      return;
    }
    if (looping) { addLog('sys', '· a loop is already running. Reset to start over.'); return; }
    setStatus('looping');
    setIters(0);
    addLog('ok', `✓ loop armed (Active=true). Resends a fixed prompt until “${SENTINEL}”, a deny word, or cap ${CAP}.`);
    addLog('sys', '  now tell it what the agent replied each turn ↓');
  };

  const reply = (kind) => {
    if (!looping) {
      addLog('sys', stopped
        ? `· loop has stopped (${status}). Reset to run again.`
        : '· loop isn’t running — Arm it first.');
      return;
    }
    // HandleLoop order: errored → sentinel(done) → deny(escalate) → cap(capped) → resend.
    if (kind === 'error') {
      setStatus('error');
      addLog('rej', '✗ run.Status=="error" → Resolve("error"). Loop stops — won’t hammer a broken agent.');
      return;
    }
    if (kind === 'done') {
      setStatus('done');
      addLog('ok', `✓ sentinel “${SENTINEL}” seen → Resolve("done"). Loop stops, success.`);
      return;
    }
    if (kind === 'deny') {
      setStatus('escalate');
      addLog('rej', '✗ deny-list hit ("deploy") → Resolve("escalate"). Risky reply is never auto-continued.');
      return;
    }
    // "work": no stop fired → check the cap, then resend.
    if (iters >= CAP) {
      setStatus('capped');
      addLog('rej', `✗ IterationsDone (${iters}) ≥ MaxIterations (${CAP}) → Resolve("capped"). A loop can’t run forever.`);
      return;
    }
    const n = iters + 1;
    setIters(n);
    addLog('ev', `→ no stop: TryBeginRun("builder") → TrySendLoop resend #${n}. IterationsDone=${n}; audit outcome="loop".`);
  };

  const reset = () => {
    setStatus('idle');
    setIters(0);
    setLog([{ id: idRef.current++, cls: 'sys', msg: '· reset. Open the gate, Arm the loop, then click a reply to drive a turn.' }]);
  };

  const toggleGate = () => {
    setGateOn((g) => {
      const next = !g;
      addLog('sys', '· operator gate ' + (next ? 'OPENED — the engine may now act.' : 'closed — the engine is inert.'));
      return next;
    });
  };

  return (
    <div className="cm-sim">
      <div className="cm-replies">
        {REPLIES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`cm-reply cm-reply--${r.cls}`}
            onClick={() => reply(r.key)}
            disabled={!looping}
          >
            <b>The agent {r.label}</b>
            <span>{r.sub}</span>
          </button>
        ))}
      </div>

      <div className="cm-slot">
        <div className={`cm-loopstat cm-loopstat--${status}`}>
          <div className="cm-loopstat__lab">loop · this repo</div>
          <div className="cm-loopstat__val">{STATUS_TEXT[status]}</div>
          <div className="cm-iters" aria-label={`${iters} of ${CAP} resends`}>
            {Array.from({ length: CAP }, (_, i) => (
              <i key={i} className={`cm-iters__dot${i < iters ? ' on' : ''}`} />
            ))}
            <span className="cm-iters__txt">{iters} / {CAP} resends</span>
          </div>
        </div>
        <div className="cm-ask">
          <b>Loop mode</b> = a <em>deterministic</em> driver. No classifier, no LLM — it resends one
          fixed prompt and stops on the first of <b>error · sentinel · deny · cap</b>.
        </div>
      </div>

      <div className="cm-ctl">
        <button type="button" onClick={arm} disabled={looping}>▸ Arm the loop</button>
        <button type="button" onClick={reset}>↺ Reset</button>
        <div className="cm-gate">
          operator gate
          <button type="button" className={`cm-switch${gateOn ? ' on' : ''}`} onClick={toggleGate} aria-pressed={gateOn}><i /></button>
          <span>{gateOn ? 'on' : 'off'}</span>
        </div>
      </div>

      <div className="cm-log">
        {log.map((l) => <div key={l.id} className={`cm-ln cm-ln--${l.cls}`}>{l.msg}</div>)}
      </div>
    </div>
  );
}

// ─────────────────────────────── the map shell ───────────────────────────────
export default function AutopilotMap() {
  const [view, setView] = useState('overview');

  return (
    <div className="cm">
      <nav className="cm-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`cm-tab${view === v.id ? ' active' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div className="cm-panel cm-overview">
          <h3 className="cm-h1">How autopilot works — and what stops it</h3>
          <p className="cm-lede">
            The autopilot is a backend <b className="cm-lp">BackgroundService</b> that wakes every 10s
            and may drive an idle agent for you. It is <em>not</em> a separate path to the CLI — it
            reuses the <b>exact</b> machinery the “How chat works” map shows (the same
            <code> TryBeginRun</code> → CLI). What makes it safe is a stack of fences, starting with a
            gate <b>only the host PC can open</b>. Everything here is drawn from the real code (cited
            in each node).
          </p>
          <div className="cm-pills">
            <span className="cm-pill">gate: <b>host-only</b>, default off</span>
            <span className="cm-pill">tick: <b>every 10s</b></span>
            <span className="cm-pill">two drivers: <b>classifier</b> · <b>loop</b></span>
            <span className="cm-pill">loop <b>takes precedence</b></span>
          </div>
          <div className="cm-ov">
            <div className="cm-ovcard cm-ovcard--a"><h4>🗺️ System map</h4><p>The whole subsystem — host PC → backend engine → the shared builder slot → CLI + disk — as one interactive graph. Click any box for its file and role.</p></div>
            <div className="cm-ovcard cm-ovcard--c"><h4>🔁 Step a loop</h4><p>A live model of loop mode. Arm a loop, then say what the agent replied each turn and watch it resend, count iterations, and stop on done / escalate / capped / error.</p></div>
            <div className="cm-ovcard cm-ovcard--b"><h4>🧭 Decision per turn</h4><p>The deterministic check order the loop runs — <code>errored → sentinel → deny-list → cap → resend</code> — as a flow graph.</p></div>
            <div className="cm-ovcard cm-ovcard--d"><h4>🛡️ Safety fences</h4><p>Every layer that keeps the autopilot from doing something you didn’t ask for — the gate, kill switch, threshold, deny-list, cap, single-writer slot and audit.</p></div>
          </div>
          <p className="cm-note">
            <b>The one idea everything hangs on:</b> the autopilot has <em>no special authority</em>. It
            sends through the same single <code>builder</code> slot you do (so it can never collide with
            your turn), it can only ever send one of <em>your</em> routine prompts or escalate, and the
            master switch lives in the <b>desktop window</b> — so a steered web client or a
            prompt-injected agent can’t grant it the power to act. The web UI can only ever <em>shrink</em>
            that authority, never grow it.
          </p>
        </div>
      )}

      {view === 'map' && (
        <div className="cm-panel">
          <p className="cm-note">Read it left to right: the <b>host PC</b> (the only door in) → the
            <b className="cm-cls"> backend on :5099</b> → the <b>CLI + disk</b>, with the
            <b className="cm-you"> web UI</b> reading from the side. The <b className="cm-lp">engine</b>,
            <b className="cm-lp"> brain</b> and the shared <b>builder slot</b> are dashed components of
            the backend. The autopilot has <i>no private path to the CLI</i> — every send goes through
            the same <code>TryBeginRun</code> a chat does.</p>

          <ChatGraph spec={AUTOPILOT_MAP} intro={MAP_INTRO} />

          <div className="cm-legend">
            <span><i className="cm-sw cm-sw--actor" />host / operator</span>
            <span><i className="cm-sw cm-sw--backend" />backend :5099</span>
            <span><i className="cm-sw cm-sw--auto" />autopilot engine</span>
            <span><i className="cm-sw cm-sw--store" />persistent (disk)</span>
            <span><i className="cm-sw cm-sw--cli" />CLI process</span>
            <span><i className="cm-sw cm-sw--client" />web UI</span>
            <span>▭ <b>boxes = where it runs</b> — solid tier (host · backend · CLI · disk · web); dashed = a backend component</span>
          </div>
          <p className="cm-note">
            <b className="cm-bad">Red</b> edges are blocks: the gate <code>fences every endpoint → 403</code>,
            and a deny-listed label escalates instead of sending. <b>Amber</b> edges are the privileged
            paths — only the host’s button reaches the gate, and only <code>RunAsync</code> spawns the CLI.
          </p>
        </div>
      )}

      {view === 'loop' && (
        <div className="cm-panel">
          <p className="cm-note">
            Loop mode is the <b className="cm-lp">deterministic</b> driver: it resends one fixed prompt
            each idle turn and stops on the first of <b>error · sentinel · deny-list · cap</b> — no
            classifier, no model in the loop. Open the operator gate, <b>Arm the loop</b>, then tell it
            what the agent replied each turn. (Cap is {CAP} here so you can reach it fast; the real
            default is 10.)
          </p>
          <LoopSim />
          <p className="cm-note">
            Each resend claims the same <code>builder</code> slot a human turn does, bumps
            <code> IterationsDone</code>, and writes one append-only audit line
            (<code>outcome="loop"</code>). With the gate <b>off</b> (the default) nothing happens at all.
            The exact check order is the <b>Decision per turn</b> view.
          </p>
        </div>
      )}

      {view === 'decision' && (
        <div className="cm-panel">
          <p className="cm-note">The loop’s decision, in the <b>exact order</b> <code>HandleLoop()</code>
            runs it: <code>errored → sentinel(done) → deny-list(escalate) → cap(capped) → resend</code>.
            Four outcomes are terminal; only <b>resend</b> loops back. Hover a step to isolate it.</p>
          <ChatGraph spec={LOOP_FLOW} intro={DECIDE_INTRO} />
          <p className="cm-note">
            An <b>active loop takes precedence</b> over the classifier entirely — a repo running a loop
            is never classified. Source: <code>AutopilotService.cs · HandleLoop</code>.
          </p>
        </div>
      )}

      {view === 'fences' && (
        <div className="cm-panel">
          <p className="cm-note">Nine layers stand between the autopilot and an action you didn’t ask
            for. The first — the operator gate — is the one the web <b>can never</b> open; the rest the
            web can only ever tighten.</p>
          <table className="cm-table">
            <thead><tr><th>Fence</th><th>Where</th><th>What it guarantees</th></tr></thead>
            <tbody>
              <tr><td><b>Operator gate</b></td><td><code>AutopilotGate</code> · host-only</td><td>Default <b>off</b>; the web UI can never open it — only the desktop button can.</td></tr>
              <tr><td>Kill switch</td><td><code>autopilot.json · Enabled</code></td><td>The web can <i>pause</i> the engine — shrinking authority, never growing it.</td></tr>
              <tr><td>Auto-advance</td><td><code>autopilot.json · AutoAdvance</code></td><td>Off by default: the classifier <i>suggests</i> until you opt into actually sending.</td></tr>
              <tr><td>Confidence threshold</td><td><code>0.85</code></td><td>A classifier match below it <b>escalates</b> instead of guessing.</td></tr>
              <tr><td>Deny-list</td><td><code>deploy · push · force · …</code></td><td>A risky label or reply <b>escalates</b> — both the classifier and loop mode honour it.</td></tr>
              <tr><td>Iteration cap</td><td><code>loops.json · MaxIterations</code></td><td>A loop stops at the ceiling (default 10) even if the sentinel is never said.</td></tr>
              <tr><td>Single-writer slot</td><td><code>TryBeginRun("builder")</code></td><td>The autopilot claims the same one slot you do — it can never collide with your turn.</td></tr>
              <tr><td>Audit log</td><td><code>autopilot-audit.jsonl</code></td><td>Every auto-send (and only sends) is recorded append-only — a durable trail.</td></tr>
              <tr><td><b>The brain is a stub</b></td><td><code>PromptClassifier</code></td><td>Honest today: it’s keyword overlap, <b>not an LLM</b>. It can only pick one of <i>your</i> prompts or escalate.</td></tr>
            </tbody>
          </table>
          <p className="cm-note">
            Together these mean the worst a misfiring autopilot can do is resend one of your own routine
            prompts to one agent, once per slot, on a repo you armed — and stop the moment anything looks
            risky. Sources: <code>AutopilotGate.cs</code>, <code>AutopilotConfigStore.cs</code>,
            <code> LoopConfigStore.cs</code>, <code>AutopilotAuditLog.cs</code>.
          </p>
        </div>
      )}
    </div>
  );
}
