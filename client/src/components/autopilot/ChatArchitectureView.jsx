import { useState } from 'react';
import '../../pages/autopilot.css';

// The "How chat works" tab of the AutopilotConsole (understanding.md).
// A static, diagram-driven explainer of the chat system end-to-end: the layers,
// how a conversation binds to a repo, a turn's lifecycle, and what a browser
// refresh does. No backend — pure reference content. File/line citations point
// at the real implementation so the diagrams stay honest:
//   client/src/context/ChatContext.jsx
//   ClaudeWeb.App/Controllers/ChatController.cs
//   ClaudeWeb.App/Services/Chat/RunSessionService.cs

// One storage cell in the "where it lives" map. `fate` is 'wiped' (browser
// refresh destroys it) or 'survives' (it outlives a refresh) — the Refresh!
// toggle below lights these up.
function Cell({ fate, name, where, children }) {
  return (
    <div className={`ca-cell ca-cell--${fate}`}>
      <div className="ca-cell__hd">
        <code className="ca-cell__name">{name}</code>
        <span className="ca-cell__where">{where}</span>
      </div>
      <div className="ca-cell__body">{children}</div>
      <div className="ca-cell__tag">{fate === 'wiped' ? 'wiped on refresh' : 'survives refresh'}</div>
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="ca-arrow">
      <span className="ca-arrow__line" />
      {label && <span className="ca-arrow__lbl">{label}</span>}
    </div>
  );
}

export default function ChatArchitectureView() {
  const [refreshed, setRefreshed] = useState(false);

  return (
    <div className={`ca${refreshed ? ' ca--refreshed' : ''}`}>
      <p className="autopilot__summary">
        How a chat actually works in Claude Web — from the phone in your hand to the
        CLI process and the files on disk. Everything below is drawn from the real
        code (cited inline); nothing here calls the backend.
      </p>

      {/* ───────────────────────── 1. THE LAYERS ───────────────────────── */}
      <section className="ca-sec">
        <h3 className="ca-sec__h">1 · The four layers</h3>
        <p className="ca-sec__p">
          A chat spans four places. The key idea that makes everything else work:
          the <b>run is owned by the backend, not by your browser tab</b>. Your tab
          is just a window onto it.
        </p>

        <div className="ca-layers">
          <div className="ca-layer ca-layer--client">
            <div className="ca-layer__badge">CLIENT · your phone/browser</div>
            <div className="ca-box">
              <code>ChatContext.jsx</code>
              <ul>
                <li><code>convos</code> — messages, in memory</li>
                <li><code>seqRefs</code> — last seq seen per chat</li>
                <li><code>abortRefs</code> — the live SSE reader</li>
              </ul>
            </div>
            <div className="ca-box ca-box--persist">
              <code>localStorage</code>
              <ul><li>active <code>sessionId</code> per chat</li></ul>
            </div>
          </div>

          <Arrow label="HTTP + SSE" />

          <div className="ca-layer ca-layer--server">
            <div className="ca-layer__badge">BACKEND · Kestrel :5099</div>
            <div className="ca-box">
              <code>ChatController.cs</code>
              <ul>
                <li><code>POST /api/chat</code> — start a turn</li>
                <li><code>GET /api/chat/stream?after=N</code> — (re)attach</li>
                <li><code>GET /api/runs</code> · <code>POST /chat/stop</code></li>
              </ul>
            </div>
            <div className="ca-box ca-box--run">
              <code>RunSession</code> (one per repo · lane)
              <ul>
                <li>seq-numbered event <b>buffer</b></li>
                <li>subscriber channels</li>
                <li><code>Cts</code> — only Stop/shutdown kills it</li>
              </ul>
            </div>
          </div>

          <Arrow label="spawns / drives" />

          <div className="ca-layer ca-layer--cli">
            <div className="ca-layer__badge">CLI + DISK</div>
            <div className="ca-box">
              <code>claude</code> process
              <ul><li>run with the run-session token, <b>not</b> RequestAborted</li></ul>
            </div>
            <div className="ca-box ca-box--persist">
              <code>~/.claude/…/&lt;sid&gt;.jsonl</code>
              <ul><li>append-only transcript, on the machine</li></ul>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── 2. CONVERSATION ↔ REPO ↔ RUN ──────────────── */}
      <section className="ca-sec">
        <h3 className="ca-sec__h">2 · How a conversation ties to a repo</h3>
        <p className="ca-sec__p">
          The binding has three grains. A <b>conversation</b> is what you see (a tab,
          or the default chat). A <b>run</b> is the work, slotted one-per-repo-per-lane
          on the backend. A <b>session</b> is the durable identity — the JSONL file.
        </p>
        <div className="ca-bind">
          <div className="ca-bind__col">
            <div className="ca-pill ca-pill--convo">conversation</div>
            <div className="ca-bind__note">client key = tab id (or <code>default</code>). Device-local; many can be live at once.</div>
          </div>
          <div className="ca-bind__op">keyed by repo + lane →</div>
          <div className="ca-bind__col">
            <div className="ca-pill ca-pill--run">RunSession</div>
            <div className="ca-bind__note">
              one <b>builder</b> run per repo (a 2nd send while running → <b>409</b>); the
              read-only <code>ask</code> lane runs alongside. seq is monotonic per repo
              <i> across</i> runs.
            </div>
          </div>
          <div className="ca-bind__op">captures →</div>
          <div className="ca-bind__col">
            <div className="ca-pill ca-pill--sess">sessionId / JSONL</div>
            <div className="ca-bind__note">the conversation's real identity, passed to the CLI as <code>--resume</code>. Lives on disk, never in git.</div>
          </div>
        </div>
        <p className="ca-sec__foot">
          Switching the global repo selector resets the <i>default</i> chat's visible
          state — but the old repo's run survives on the backend and its transcript is
          on disk, so switching back + reconcile restores it. Dock tabs pin their own
          repo, so they never suffer this.
        </p>
      </section>

      {/* ──────────────────── 3. A TURN'S LIFECYCLE ──────────────────── */}
      <section className="ca-sec">
        <h3 className="ca-sec__h">3 · The life of one turn</h3>
        <ol className="ca-steps">
          <li><span className="ca-steps__n">1</span><div><b>You send.</b> <code>POST /api/chat</code> creates (or reuses) the repo's <code>RunSession</code> and kicks off the CLI on a background task tied to the <i>run-session</i> token — never the HTTP request. Your disconnecting can't kill it.</div></li>
          <li><span className="ca-steps__n">2</span><div><b>The CLI streams.</b> Each event is tagged with the next <code>seq</code>, appended to the run's buffer, and broadcast to every attached subscriber — all under one lock so the replay/live boundary never drops or doubles an event.</div></li>
          <li><span className="ca-steps__n">3</span><div><b>Your tab reads.</b> The open SSE stream delivers events; the client ignores any <code>seq</code> ≤ its watermark, so re-delivery is harmless (idempotent).</div></li>
          <li><span className="ca-steps__n">4</span><div><b>It ends.</b> A terminal <code>done</code> finalizes the run as <code>done</code>; a cancel/crash finalizes as <code>error</code>. The transcript is on disk regardless.</div></li>
        </ol>
      </section>

      {/* ───────────────────── 4. WHAT REFRESH DOES ──────────────────── */}
      <section className="ca-sec">
        <div className="ca-sec__hdrow">
          <h3 className="ca-sec__h">4 · What a browser refresh does</h3>
          <button
            className={`ca-refbtn${refreshed ? ' on' : ''}`}
            onClick={() => setRefreshed((r) => !r)}
          >
            {refreshed ? '↺ Reset' : '⟳ Refresh!'}
          </button>
        </div>
        <p className="ca-sec__p">
          A full refresh is the most destructive thing the client can do to <i>itself</i> —
          and the run doesn't notice. Hit <b>Refresh!</b> to see what's destroyed (red)
          versus what survives (green).
        </p>

        <div className="ca-map">
          <Cell fate="wiped" name="convos / seqRefs / abortRefs" where="client RAM">
            All React state, gone. Watermarks reset to 0.
          </Cell>
          <Cell fate="wiped" name="SSE connection" where="browser ↔ server">
            Torn down. Server sees RequestAborted, logs “client detached; run continues.”
          </Cell>
          <Cell fate="survives" name="localStorage sessionId" where="browser disk">
            Persisted — the chat still knows which session it was on.
          </Cell>
          <Cell fate="survives" name="RunSession + buffer" where="backend RAM">
            The run keeps going; every event stays buffered with its seq.
          </Cell>
          <Cell fate="survives" name="JSONL transcript" where="machine disk">
            The CLI's append-only record of the turn.
          </Cell>
        </div>

        <div className={`ca-recon${refreshed ? ' show' : ''}`}>
          <h4 className="ca-recon__h">…then reconcile rebuilds it</h4>
          <ol className="ca-steps ca-steps--tight">
            <li><span className="ca-steps__n">1</span><div>On mount (once the dock list lands), <code>reconcile()</code> calls <code>GET /api/runs</code> to ask which repos are still running.</div></li>
            <li><span className="ca-steps__n">2</span><div>For a running repo it calls <code>attachToRun()</code>. The wiped conversation looks <i>fresh</i>, so it first <code>loadTranscript(sessionId)</code> from disk — your prompt &amp; finished output reappear.</div></li>
            <li><span className="ca-steps__n">3</span><div>Then it opens <code>stream?after=N</code>. Since <code>seqRefs</code> was wiped, <b>N = 0</b>, so the backend <b>replays the whole buffer</b> and continues live.</div></li>
            <li><span className="ca-steps__n">4</span><div>If the run already finished, <code>/runs</code> says so → it just fixes the tab badge and loads the transcript (replay-only). Either way: <b>nothing lost, run never interrupted.</b></div></li>
          </ol>
          <p className="ca-edge">
            Edge: the buffer is capped (~10k events, oldest trimmed). A very long turn
            can't fully replay from <code>after=0</code> — but <code>loadTranscript</code>
            already pulled the persisted part from disk first, so only the live tail
            streams fresh.
          </p>
        </div>
      </section>

      <p className="ca-foot">
        Sources: <code>ChatContext.jsx</code> (reconcile / attachToRun / streamRun),
        <code>ChatController.cs</code> (chat / stream / runs / stop),
        <code>RunSessionService.cs</code> (RunSession buffer &amp; replay).
      </p>
    </div>
  );
}
