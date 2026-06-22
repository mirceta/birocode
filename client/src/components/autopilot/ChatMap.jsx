import { useRef, useState } from 'react';
import ChatGraph from './ChatGraph';
import { SYSTEM_MAP, TURN_FLOW, SSE_FAN } from './chatArchitectureData';

// The interactive "How chat works" map, embedded as real React code in the dock tab
// (formerly an iframe of the rolling understanding-app snapshot). A self-contained
// dark stage with five internal views — Overview · System map · Drive a turn · Life
// of a turn · SSE contract — plus the single-slot "drive a turn" simulator, ported
// from the old app.js to React state.

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'System map' },
  { id: 'drive', label: 'Drive a turn' },
  { id: 'life', label: 'Life of a turn' },
  { id: 'sse', label: 'SSE contract' },
];

const MAP_INTRO = 'The whole journey of one chat turn. Every box is a place it runs: the solid boxes are the four tiers (your device · backend :5099 · CLI · disk); the dashed boxes inside the backend are its components. Hover a node to light up its connections, or click a box to read what that tier/component is. The autopilot lives inside the backend — just another caller of the same machinery.';
const LIFE_INTRO = 'The five stages of a turn, the reject branch, and the loop-back. Hover a stage to isolate it; click for detail.';
const SSE_INTRO = 'Raw stream-json reduced to seven stable event shapes. The three boxes are where each thing lives — the raw CLI output never leaves its box; only the seven reduced shapes reach the client box. Hover the reducer or any event to trace it.';

// ─────────────────────────── Drive-a-turn simulator ───────────────────────────
const SIM_META = {
  you: { name: 'You (phone)', kind: 'human' },
  cls: { name: 'Classifier (auto-advance)', kind: 'auto' },
  lp:  { name: 'Loop mode (resend)', kind: 'auto' },
};

function Simulator() {
  const [gateOn, setGateOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(null);
  const [log, setLog] = useState([]);
  const seqRef = useRef(0);
  const timerRef = useRef(null);
  const idRef = useRef(0);

  const addLog = (cls, msg) =>
    setLog((prev) => [{ id: idRef.current++, cls, msg }, ...prev]);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const begin = (driver) => {
    const m = SIM_META[driver];
    if (m.kind === 'auto' && !gateOn) {
      addLog('sys', '· ' + m.name + ': gate is OFF — autopilot does nothing. (Only you can send.)');
      return;
    }
    if (busy) {
      if (driver === 'you') addLog('rej', '✗ POST /api/chat → 409 Conflict — a turn is already running (' + SIM_META[owner].name + ').');
      else if (driver === 'lp' && owner === 'cls') addLog('rej', '✗ loop skips: classifier holds the slot (and loop would take precedence next idle tick).');
      else if (driver === 'cls' && owner === 'lp') addLog('rej', '✗ classifier skips: active loop on this repo → classification is bypassed entirely.');
      else addLog('rej', '✗ ' + m.name + ' skips: IsBusy / TryBeginRun==false — won’t pile on ' + SIM_META[owner].name + '.');
      return;
    }
    seqRef.current += 1;
    setBusy(true);
    setOwner(driver);
    addLog('ok', '✓ TryBeginRun("builder") → claimed by ' + m.name + '.  seq continues at ' + seqRef.current + '.');
    if (driver === 'you') addLog('sys', '  POST /api/chat → spawns claude on a detached Task.Run (Cts token).');
    if (driver === 'cls') addLog('sys', '  Tick: confident + non-risky + gated → TrySend → resume session.');
    if (driver === 'lp')  addLog('sys', '  Tick: no sentinel / under cap → TrySendLoop → resend fixed prompt (audited).');
    let n = 0;
    clearTimer();
    timerRef.current = setInterval(() => {
      n++;
      if (n === 1) addLog('ev', '  → SSE: {type:"token", …}  (buffered seq, broadcast to subscribers)');
      if (n === 2) addLog('ev', '  → SSE: {type:"tool", status:"start", …}');
      if (n >= 3) clearTimer();
    }, 700);
  };

  const finish = () => {
    if (!busy) return;
    clearTimer();
    addLog('ok', '✓ {type:"done"} → RunSession.Complete(): status=done, slot freed, transcript on disk.');
    if (owner !== 'you') addLog('sys', '  next tick reads this reply from the JSONL transcript to decide what’s next.');
    setBusy(false);
    setOwner(null);
  };

  const reset = () => {
    clearTimer();
    seqRef.current = 0;
    setBusy(false);
    setOwner(null);
    setLog([{ id: idRef.current++, cls: 'sys', msg: '· reset. seq back to 0. Tip: open the gate, start the classifier, then hit "Send a turn" to see a 409.' }]);
  };

  const toggleGate = () => {
    setGateOn((g) => {
      const next = !g;
      addLog('sys', '· operator gate ' + (next ? 'OPENED — autopilot drivers may now act.' : 'closed — autopilot drivers are inert.'));
      return next;
    });
  };

  const drivers = [
    { key: 'you', cls: 'you', title: 'You · the phone', dot: 'Send a turn', desc: 'A human send from the chat box.', call: 'POST /api/chat' },
    { key: 'cls', cls: 'cls', title: 'Classifier · auto-advance', dot: 'Auto-advance', desc: 'Reads the last reply, picks a routine prompt, sends only if confident, non-risky & gated.', call: 'Tick → TrySend → TryBeginRun' },
    { key: 'lp',  cls: 'lp',  title: 'Loop mode · resend', dot: 'Resend (loop)', desc: 'Deterministically resends one fixed prompt each turn until a sentinel / cap / deny-list stop.', call: 'Tick → TrySendLoop → TryBeginRun' },
  ];

  return (
    <div className="cm-sim">
      <div className="cm-drivers">
        {drivers.map((d) => (
          <div key={d.key} className={`cm-driver cm-driver--${d.cls}${owner === d.key ? ' win' : ''}`}>
            <h4><span className="cm-driver__dot" /> {d.title}</h4>
            <p>{d.desc}</p>
            <div className="cm-driver__call">{d.call}</div>
            <button type="button" onClick={() => begin(d.key)}>{d.dot}</button>
          </div>
        ))}
      </div>
      <div className="cm-slot">
        <div className={`cm-slotbox${busy ? ' busy' : ' idle'} cm-slotbox--${owner || 'none'}`}>
          <div className="cm-slotbox__lab">builder slot · this repo</div>
          <div className="cm-slotbox__who">{busy ? 'running · ' + SIM_META[owner].name : 'idle — open for one writer'}</div>
        </div>
        <div className="cm-ask">
          <b>ask lane</b> = a <em>separate</em> slot. The read-only
          (<code>--permission-mode plan</code>) side conversation runs <b>concurrently</b> — it can't write, so it's safe.
        </div>
      </div>
      <div className="cm-ctl">
        <button type="button" onClick={finish} disabled={!busy}>▸ Finish current turn</button>
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
// The four reconcile steps after a refresh — folded in from the old §3 prose so the
// "what survives" overlay also shows how the wiped client is rebuilt.
const RECON_STEPS = [
  <>On mount (once the dock list lands), <code>reconcile()</code> calls <code>GET /api/runs</code> to ask which repos are still running.</>,
  <>For a running repo it calls <code>attachToRun()</code>. The wiped conversation looks <i>fresh</i>, so it first <code>loadTranscript(sessionId)</code> from disk — your prompt &amp; finished output reappear.</>,
  <>Then it opens <code>stream?after=N</code>. Since <code>seqRefs</code> was wiped, <b>N = 0</b>, so the backend <b>replays the whole buffer</b> and continues live.</>,
  <>If the run already finished, <code>/runs</code> says so → it just fixes the tab badge and loads the transcript (replay-only). Either way: <b>nothing lost, run never interrupted.</b></>,
];

export default function ChatMap() {
  const [view, setView] = useState('overview');
  // Overlay folded onto the System map: 'none' | 'bind' (§2) | 'refresh' (§3).
  const [overlay, setOverlay] = useState('none');
  const toggleOverlay = (which) => setOverlay((o) => (o === which ? 'none' : which));

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
          <h3 className="cm-h1">How chat works — and who can drive a turn</h3>
          <p className="cm-lede">
            A chat in Claude Web is not owned by your browser tab — it's a backend-owned
            <b> Run</b>. That one fact is what lets your phone disconnect mid-turn, and it's
            also what lets the <b className="cm-cls">autopilot</b> drive an agent: the autopilot
            is not a separate chat path, it <em>reuses the same machinery you do</em>. These
            views map it out interactively; everything is drawn from the real code (cited below).
          </p>
          <div className="cm-pills">
            <span className="cm-pill">backend: <b>Kestrel :5099</b></span>
            <span className="cm-pill">one writer per <b>(repo · lane)</b></span>
            <span className="cm-pill"><b>seq</b> monotonic per repo across runs</span>
          </div>
          <div className="cm-ov">
            <div className="cm-ovcard cm-ovcard--a"><h4>🗺️ System map</h4><p>The whole journey of a turn — your device → backend → CLI + disk — as one interactive graph. Hover any box to isolate its connections; click for detail.</p></div>
            <div className="cm-ovcard cm-ovcard--b"><h4>🎛️ Drive a turn</h4><p>A live simulator of the <b>one writer slot, three drivers</b> rule. Open the operator gate and watch you, the classifier and loop mode contend for the same slot.</p></div>
            <div className="cm-ovcard cm-ovcard--c"><h4>🔁 Life of a turn</h4><p>The five stages of a single turn, the reject branch, and the loop-back that makes the autopilot possible.</p></div>
            <div className="cm-ovcard cm-ovcard--d"><h4>📡 SSE contract</h4><p>How raw CLI <code>stream-json</code> is reduced to seven stable event shapes the client understands.</p></div>
          </div>
          <p className="cm-note">
            <b>The one idea everything hangs on:</b> a turn runs on a background <code>Task.Run</code>
            tied to the RunSession's own <code>Cts</code> token — <b>never</b> the HTTP request's
            <code>RequestAborted</code>. Lock your phone and the SSE attachment drops; the CLI keeps
            working and billing, and you reattach later via <code>stream?after=N</code>. Because every
            writer — you, the classifier, loop mode — goes through the same <code>TryBeginRun</code>,
            the autopilot can never collide with you on an agent.
          </p>
        </div>
      )}

      {view === 'map' && (
        <div className="cm-panel">
          <p className="cm-note">Read it left to right: <b className="cm-you">your device</b> → the
            <b className="cm-cls"> backend on :5099</b> → the <b>CLI + disk</b>. Each <b>box is a place
            something runs</b> — solid tier boxes are separate processes/devices; the dashed boxes
            inside the backend are its four components. The <b className="cm-lp">autopilot</b> sits
            <i> inside the backend box</i> too: just another component calling the same
            <code> TryBeginRun</code>, with no private path to the CLI.</p>

          {/* Two prose sections (the conversation↔run binding and "what a refresh does")
              folded into this one map as overlays — one visual grammar, the snapshot is the source. */}
          <div className="cm-ovbar">
            <span className="cm-ovbar__lab">Overlays:</span>
            <button
              type="button"
              className={`cm-ovbtn cm-ovbtn--bind${overlay === 'bind' ? ' on' : ''}`}
              aria-pressed={overlay === 'bind'}
              onClick={() => toggleOverlay('bind')}
            >🔗 Show the binding</button>
            <button
              type="button"
              className={`cm-ovbtn cm-ovbtn--refresh${overlay === 'refresh' ? ' on' : ''}`}
              aria-pressed={overlay === 'refresh'}
              onClick={() => toggleOverlay('refresh')}
            >{overlay === 'refresh' ? '↺ Reset' : '⟳ Refresh!'}</button>
            <span className="cm-ovbar__hint">
              {overlay === 'bind' && 'conversation → run → session, traced through the nodes that already exist.'}
              {overlay === 'refresh' && 'red = wiped by a browser refresh · green = survives · amber = the twist.'}
              {overlay === 'none' && 'two ways to read the same map: how a chat binds to a run, and what a refresh destroys.'}
            </span>
          </div>

          <ChatGraph spec={SYSTEM_MAP} intro={MAP_INTRO} overlay={overlay} />

          {overlay === 'bind' && (
            <div className="cm-ovnote">
              <div className="cm-bindkey">
                <span><i className="cm-sw cm-sw--client" /><b>conversation</b> — a tab (or <code>default</code>); device-local, many at once.</span>
                <span><i className="cm-sw cm-sw--backend" /><b>run</b> — one builder slot per repo·lane; a 2nd send → <b className="cm-bad">409</b>.</span>
                <span><i className="cm-sw cm-sw--store" /><b>session</b> — the <code>sessionId</code> / JSONL; the durable identity, passed as <code>--resume</code>.</span>
              </div>
              <p className="cm-note">Switching the global repo selector resets the <i>default</i> chat's visible state — but the old repo's run survives on the backend and its transcript is on disk, so switching back + reconcile restores it. Dock tabs pin their own repo, so they never suffer this.</p>
            </div>
          )}

          {overlay === 'refresh' && (
            <div className="cm-ovnote">
              <div className="cm-legend">
                <span><i className="cm-sw cm-sw--wiped" />wiped on refresh</span>
                <span><i className="cm-sw cm-sw--survives" />survives refresh</span>
                <span><i className="cm-sw cm-sw--twist" />the twist</span>
              </div>
              <p className="cm-note cm-twist">
                <b>The twist:</b> <code>localStorage</code> sits inside the device box yet <b>survives</b> — it
                holds the <code>sessionId</code>. That single exception is the one thing the box boundaries
                <i> don't</i> explain for free; everything else, the spatial layout tells you.
              </p>
              <div className="cm-recon">
                <h4 className="cm-recon__h">…then reconcile rebuilds the wiped client</h4>
                <ol className="cm-steps">
                  {RECON_STEPS.map((s, i) => (
                    <li key={i}><span className="cm-steps__n">{i + 1}</span><div>{s}</div></li>
                  ))}
                </ol>
                <p className="cm-edge">
                  Edge: the buffer is capped (~10k events, oldest trimmed). A very long turn can't fully
                  replay from <code>after=0</code> — but <code>loadTranscript</code> already pulled the
                  persisted part from disk first, so only the live tail streams fresh.
                </p>
              </div>
            </div>
          )}

          <div className="cm-legend">
            <span><i className="cm-sw cm-sw--client" />client / device</span>
            <span><i className="cm-sw cm-sw--backend" />backend :5099</span>
            <span><i className="cm-sw cm-sw--store" />persistent (disk)</span>
            <span><i className="cm-sw cm-sw--cli" />CLI process</span>
            <span><i className="cm-sw cm-sw--auto" />autopilot</span>
            <span><i className="cm-sw cm-sw--actor" />actor</span>
            <span>▭ <b>boxes = where it runs</b> — solid tier (device · backend · CLI · disk); dashed = a backend component</span>
          </div>
        </div>
      )}

      {view === 'drive' && (
        <div className="cm-panel">
          <p className="cm-note">
            Every turn must first claim the repo's <code>builder</code> slot via
            <code> RunSessionService.TryBeginRun(repoId, "builder")</code>. Three different drivers
            call that same method — so they <b>can never run concurrently on one agent</b>. First
            caller wins; the rest are turned away. Open the operator gate, then press each driver's
            button (try two fast) to see the single-flight in action.
          </p>
          <Simulator />
          <p className="cm-note">
            With the gate <b>off</b> (the default) the autopilot does nothing at all — only you can
            send. While a turn runs, a second <b className="cm-you">you</b> send gets
            <b className="cm-bad"> 409 Conflict</b>; the autopilot drivers simply <b>skip</b>. And
            <b className="cm-lp"> loop mode takes precedence</b>: a repo with an active loop skips
            classification entirely.
          </p>
        </div>
      )}

      {view === 'life' && (
        <div className="cm-panel">
          <p className="cm-note">Five stages, one reject branch, and a loop-back. Hover a stage to
            isolate it; click for the exact code behaviour.</p>
          <ChatGraph spec={TURN_FLOW} intro={LIFE_INTRO} />
        </div>
      )}

      {view === 'sse' && (
        <div className="cm-panel">
          <p className="cm-note">The frontend never sees raw CLI internals. <code>CliRunnerService</code>
            reduces <code>stream-json</code> to seven event shapes (one JSON object per
            <code> data:</code> line). Hover the reducer to fan out all seven.</p>
          <ChatGraph spec={SSE_FAN} intro={SSE_INTRO} />
          <table className="cm-table">
            <thead><tr><th>SSE event</th><th>From</th><th>Carries</th></tr></thead>
            <tbody>
              <tr><td><code>session</code></td><td>system/init</td><td>the <code>sessionId</code> (resume key)</td></tr>
              <tr><td><code>token</code></td><td>text_delta</td><td>visible answer text, streamed</td></tr>
              <tr><td><code>thinking</code></td><td>thinking delta</td><td>reasoning (dimmed; never in the answer bubble)</td></tr>
              <tr><td><code>tool</code></td><td>tool_use / tool_result</td><td><code>start</code> → <code>input</code> → <code>end</code></td></tr>
              <tr><td><code>usage</code></td><td>message.usage</td><td>context-fill token count</td></tr>
              <tr><td><code>done</code></td><td>result</td><td><code>sessionId</code>, cost</td></tr>
              <tr><td><code>error</code></td><td>is_error / throttle / exit≠0</td><td>a message</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
