import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiStreamGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import '../../pages/autopilot.css';

// The documentation subtabs of the 🧪 Tests root tab (openspec:
// add-autopilot-tests-tab, updated by add-loop-eval-suite,
// add-loop-eval-live-mode and add-loop-eval-ui-runner) — the stated map of
// what automated test coverage the loop engine has, so the inventory lives in
// the app instead of chat history. Three sections: the unit-test layer, the
// end-to-end eval layer, and the honest coverage gap + the plan to close it.
// The fourth subtab (runnable browser tests) is the existing SystemTestsView,
// rendered by the console.
//
// Mostly static reference content citing the real files it describes — except
// the E2E eval section below, which since add-loop-eval-ui-runner can also
// START the live-mode scenarios: the harness spawns the committed suite's own
// scripts (`node tests/loop-eval/<scenario>.mjs --live`) against itself and
// streams run state + verdicts back here over SSE.

// Terminal run states — everything else means a run is in flight.
const TERMINAL = ['passed', 'failed', 'error', 'stopped'];

// Run state → badge class (reuses the st-* palette) + label.
const RUN_STATUS = {
  preflight: { cls: 'run', label: 'preflight' },
  armed: { cls: 'run', label: 'armed' },
  running: { cls: 'run', label: 'running' },
  passed: { cls: 'sent', label: 'passed' },
  failed: { cls: 'esc', label: 'failed' },
  error: { cls: 'esc', label: 'error' },
  stopped: { cls: 'idle', label: 'stopped' },
};

// ApiError.message carries the response body (usually {"error": "..."}).
function apiErrorText(e) {
  try {
    return JSON.parse(e.message)?.error || e.message;
  } catch {
    return e?.message || 'request failed';
  }
}

// The E2E eval runner (openspec: add-loop-eval-ui-runner): scenario rows with
// cost copy + a confirm step, a preflight banner with what-to-click
// instructions (never an enable button — the gate and kill switch stay
// operator-owned), and the active run's live state/tail/verdict via SSE.
function LoopEvalRunner() {
  const enabled = useFeature('loopEvalRunner');
  const [pre, setPre] = useState(null); // GET /loopeval/preflight
  const [run, setRun] = useState(null); // current (or last) run snapshot
  const [confirming, setConfirming] = useState(null); // scenario id awaiting the cost confirm
  const [error, setError] = useState('');
  const alive = useRef(false);
  const tailRef = useRef(null);
  const lastState = useRef('');

  const active = !!run && !TERMINAL.includes(run.state);

  const loadPre = useCallback(async () => {
    try {
      setPre(await apiGet('/loopeval/preflight'));
    } catch {
      /* keep the last snapshot; Start stays blocked while pre is null */
    }
  }, []);

  // Preflight on show + a slow poll — the gate/kill switch flip outside this UI.
  useEffect(() => {
    if (!enabled) return undefined;
    loadPre();
    const t = setInterval(loadPre, 10000);
    return () => clearInterval(t);
  }, [enabled, loadPre]);

  // Current run on mount, then the SSE stream (re-subscribes after drops).
  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    let ctl = null;
    let retry = null;
    apiGet('/loopeval/runs/current')
      .then((r) => { if (alive.current) setRun(r.run || null); })
      .catch(() => {});
    const subscribe = () => {
      if (!alive.current) return;
      ctl = new AbortController();
      let buf = '';
      apiStreamGet('/loopeval/runs/stream', (chunk) => {
        buf += chunk;
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const data = frame.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
          if (!data) continue; // heartbeat comment
          try {
            const s = JSON.parse(data);
            if (alive.current) setRun(s.run || null);
          } catch {
            /* torn frame — the next snapshot supersedes it */
          }
        }
      }, { signal: ctl.signal })
        .catch(() => {})
        .finally(() => {
          if (alive.current) retry = setTimeout(subscribe, 3000);
        });
    };
    subscribe();
    return () => {
      alive.current = false;
      ctl?.abort();
      clearTimeout(retry);
    };
  }, [enabled]);

  // A finished run may leave a fixture repo behind — re-check right away.
  useEffect(() => {
    const s = run?.state || '';
    if (s !== lastState.current && TERMINAL.includes(s)) loadPre();
    lastState.current = s;
  }, [run?.state, loadPre]);

  // Keep the live tail pinned to the newest line.
  useEffect(() => {
    if (tailRef.current) tailRef.current.scrollTop = tailRef.current.scrollHeight;
  }, [run?.tail]);

  const start = useCallback(async (id) => {
    setConfirming(null);
    try {
      const r = await apiPost('/loopeval/runs', { scenario: id });
      setRun(r.run || null);
      setError('');
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      const r = await apiDelete('/loopeval/runs/current');
      setRun(r.run || null);
      setError('');
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, []);

  if (!enabled) return null;

  // Unmet preconditions → actionable instructions (design D4: shown here,
  // enforced by the suite's own preflight; NOTHING here enables anything).
  const problems = [];
  if (pre) {
    if (!pre.suitePresent) {
      problems.push(`The eval suite is missing — expected ${pre.suitePath}. E2E evals only work when the harness runs its own checkout (Self-Development).`);
    }
    if (!pre.gateOpen) {
      problems.push('Operator gate is OFF — enable Autopilot in the HOST GUI (the toggle on the harness window at the PC), then come back here.');
    }
    if (!pre.killSwitchEnabled) {
      problems.push('Autopilot kill switch is OFF — turn Enabled ON in this console (Suggestion-based loop → Control), then come back here.');
    }
    for (const r of pre.leftoverRepos || []) {
      problems.push(`Leftover fixture repo "${r.name}" from a previous run — remove its repo card (or DELETE /api/repos/${r.id}), then re-check.`);
    }
  }
  const blocked = !pre || problems.length > 0;
  const st = RUN_STATUS[run?.state] ?? RUN_STATUS.preflight;

  return (
    <section className="ca-sec le-runner">
      <h3 className="ca-sec__h">Run it from here — start a live-mode eval</h3>
      <p className="ca-sec__p">
        Start spawns the committed suite&apos;s own script (<code>--live</code>) against
        <b> this running harness</b> — same preflights, same assertions, watched the same
        way: the <code>loopeval-*-live</code> repo card appears, its agent dock shows the
        real turns, the Loops tab shows the loop card. <b>Runs spend real agent turns and
        real minutes</b> on this box&apos;s one <code>claude</code> CLI, so it&apos;s one
        run at a time. The harness authenticates the run with a one-shot session token it
        mints and revokes itself — no password is read, stored, or passed.
      </p>

      {problems.length > 0 && (
        <div className="st-prereq" role="note">
          <strong>⚠ Not ready to start.</strong>
          <ul className="le-problems">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {!pre && <p className="autopilot__summary">Checking preconditions…</p>}
      {error && <p className="le-error">{error}</p>}

      <ul className="le-rows">
        {(pre?.scenarios || []).map((s) => (
          <li key={s.id} className="le-row">
            <div className="le-row__main">
              <b>{s.title}</b>
              <span className="le-cost">{s.turns} · {s.minutes} · <code>{s.script}</code></span>
            </div>
            {confirming === s.id ? (
              <span className="le-confirm">
                <span>This spends <b>{s.turns}</b> and <b>{s.minutes}</b> for real — sure?</span>
                <button className="lp-arm st-run-btn" onClick={() => start(s.id)}>Start eval</button>
                <button className="ap-mini" onClick={() => setConfirming(null)}>Cancel</button>
              </span>
            ) : (
              <button
                className="lp-arm st-run-btn"
                disabled={blocked || active}
                title={active ? 'a run is already active' : undefined}
                onClick={() => { setError(''); setConfirming(s.id); }}
              >
                ▶ Start…
              </button>
            )}
          </li>
        ))}
      </ul>

      {run && (
        <div className="le-run">
          <div className="le-run__head">
            <span className={`ap-state st-${st.cls}`}>
              {active && <span className="ap-spinner" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
              {st.label}
            </span>
            <b>{run.title || run.scenario}</b>
            {run.iteration != null && <span className="ap-muted">iter {run.iteration}</span>}
            {run.startedAt && <span className="ap-muted">started {new Date(run.startedAt).toLocaleTimeString()}</span>}
            {run.finishedAt && <span className="ap-muted">· finished {new Date(run.finishedAt).toLocaleTimeString()}</span>}
            {run.exitCode != null && <span className="ap-muted">· exit {run.exitCode}</span>}
            {active && <button className="ap-mini le-stop" onClick={stop}>■ Stop run</button>}
          </div>

          {active && (
            <p className="autopilot__summary le-watch">
              Watch it live: open the <code>loopeval-*-live</code> repo (advanced visibility)
              — its agent dock shows the turns; the loop card is on this console&apos;s Loops tab.
            </p>
          )}

          {run.error && <p className="le-error">{run.error}</p>}
          {run.leftoverRepos?.length > 0 && (
            <p className="le-error">
              Leftover fixture repo(s) after this run: {run.leftoverRepos.join(', ')} — remove
              the card(s) before the next run.
            </p>
          )}

          {run.asserts?.length > 0 && (
            <ul className="le-asserts">
              {run.asserts.map((a, i) => (
                <li key={i} className={a.ok ? 'is-ok' : 'is-bad'}>
                  <span className="le-assert__mark">{a.ok ? '✓' : '✗'}</span>
                  <span className="le-assert__scen">{a.scenario}</span>
                  <span className="le-assert__name">{a.name}</span>
                  {!a.ok && a.detail && <i className="le-assert__detail">{a.detail}</i>}
                </li>
              ))}
            </ul>
          )}

          {TERMINAL.includes(run.state) && (
            <p className={`le-verdict ${run.state === 'passed' ? 'is-ok' : 'is-bad'}`}>
              {run.state === 'passed' && `PASS — every assertion held (${run.asserts?.length ?? 0} assertions).`}
              {run.state === 'failed' && `FAIL — ${(run.asserts || []).filter((a) => !a.ok).map((a) => a.name).join('; ') || 'see the output below'}.`}
              {run.state === 'error' && 'ERROR — the run did not produce a verdict; see the output below.'}
              {run.state === 'stopped' && 'STOPPED by the operator before a verdict.'}
            </p>
          )}

          <pre className="st-output le-tail" ref={tailRef}>
            {run.tail?.trim() ? run.tail : <span className="ap-muted">No output yet…</span>}
          </pre>
        </div>
      )}
    </section>
  );
}

export default function TestInventoryView({ section }) {
  if (section === 'unit') {
    return (
      <div className="ca ov">
        <p className="autopilot__summary">
          The fast, always-run layer: <b>xUnit tests in <code>tests/ClaudeWeb.Tests</code></b>,
          run with <code>dotnet test</code> — the whole suite is <b>47 tests, green, under a
          second</b>. This is the layer that guards the loop engine&apos;s <b>decision
          logic</b>; run it before every commit that touches loops.
        </p>
        <section className="ca-sec">
          <h3 className="ca-sec__h">What the loop tests cover</h3>
          <p className="ca-sec__p">
            <code>AdvanceQueueLoopTests.cs</code> — <b>13 cases</b> on the shared
            per-turn decision ladder and the queue-loop store:
          </p>
          <ul className="ov-list">
            <li>
              <b>Operator-stop attribution</b> — pressing Stop on the agent&apos;s run
              records <code>stopped · by-operator</code>, and wins over a simultaneous
              run error; a genuine agent error still reports as an error.
            </li>
            <li>
              <b>Whole-word deny matching</b> — <code>pushed</code> does not trip a
              deny term of <code>push</code>, <code>production</code> does not trip
              <code> prod</code>; the real term escalates and is named in the reason.
            </li>
            <li>
              <b>Per-arm deny storage</b> — no list at arm time stays <code>null</code>
              (global default applies); a trimmed explicit list — including an explicit
              empty one — is stored as given.
            </li>
            <li>
              <b>Resume semantics</b> — Resume reactivates the <b>same</b> loop instance
              with a fresh iteration budget and reset phase, and refuses active or
              non-queue instances.
            </li>
          </ul>
        </section>
        <section className="ca-sec">
          <h3 className="ca-sec__h">Why this layer is testable at all</h3>
          <ul className="ov-list">
            <li>
              <b><code>DrivenLoop.Decide</code> is a pure function</b>
              (<code>ClaudeWeb.App/Services/Autopilot/ILoop.cs</code>): a
              <code> LoopContext</code> (reply text, errored/stopped flags, deny list)
              goes in, a <code>LoopDecision</code> comes out — no timers, no CLI, no
              I/O. That seam is deliberate; keep new decision logic inside it.
            </li>
            <li>
              <b><code>LoopConfigStore</code> takes a test-only directory override</b>,
              so store tests run against a temp dir, never the real APPDATA state.
            </li>
          </ul>
          <p className="ca-sec__foot">
            What this layer does <b>not</b> cover: the background tick engine that
            drives real sends — see the <b>Plan: engine seam</b> subtab.
          </p>
        </section>
      </div>
    );
  }

  if (section === 'rehearsal') {
    return (
      <div className="ca ov">
        <p className="autopilot__summary">
          The slow, honest layer: the <b>committed eval suite in
          <code> tests/loop-eval/</code></b> (openspec: add-loop-eval-suite) drives the
          <b> real engine with real Claude turns</b> on committed fixture repos and
          asserts the outcomes mechanically — the one layer that can answer
          <i> &quot;does the loop actually drive an agent to the goal?&quot;</i>
        </p>
        <LoopEvalRunner />
        <section className="ca-sec">
          <h3 className="ca-sec__h">The two scenarios</h3>
          <ul className="ov-list">
            <li>
              <b>Goal loop</b> (<code>node tests/loop-eval/goal.mjs</code>) — a fixture
              todo CLI with a deliberately missing <code>done</code> command and a
              failing <code>goal-check.mjs</code>. Passes only if the loop resolves
              <code> done · verified</code> (LOOP_DONE → verify → GOAL_VERIFIED) and
              the check genuinely exits 0 afterwards.
            </li>
            <li>
              <b>Queue loop</b> (<code>node tests/loop-eval/queue.mjs</code>) — six
              prepared prompts stashed on a dock tab, each mapped to an expected
              artifact (path + regex). Passes only if the queue drains to
              <code> done · drained</code> with all six sent in order and every
              artifact present and matching.
            </li>
          </ul>
        </section>
        <section className="ca-sec">
          <h3 className="ca-sec__h">Two run modes — automatic gate, or watch it live</h3>
          <ul className="ov-list">
            <li>
              <b>Isolated (default):</b> binaries copied outside the repo tree, own
              port (:5210), fresh data dir with the gate + kill switch seeded before
              boot — never against live. Fully automatic: the mode an agent uses as a
              before-shipping gate.
            </li>
            <li>
              <b>Live (<code>--live</code>):</b> the same scenarios against THIS
              harness (:5099), so the Operator can watch the run in the real UI —
              the <code>loopeval-*-live</code> repo card appears, its agent dock
              shows the real turns, and this console&apos;s loop card ticks through the
              phases. Prerequisites: gate ON (host GUI), kill switch ON (this
              console) — the suite fails fast with instructions rather than ever
              enabling anything itself. Start it with the buttons above (the harness
              mints the run&apos;s credential itself) or from a terminal with
              <code> LOOPEVAL_LIVE_PW</code> set to the live operator password.
              Cleans up after itself (<code>LOOPEVAL_KEEP=1</code> keeps the
              aftermath for inspection).
            </li>
            <li>
              In both modes everything goes through the shipped API, exactly as an
              operator would — no engine bypass, no special endpoints.
            </li>
          </ul>
        </section>
        <section className="ca-sec">
          <h3 className="ca-sec__h">What it costs</h3>
          <ul className="ov-list">
            <li>
              <b>It spends real agent turns and real minutes</b> (~15–20 turns,
              ~30–45 min for <code>run-all.mjs</code>), so it is a before-shipping
              gate for loop changes, <b>never CI</b>. Preconditions (fixture drift,
              CLI probe) fail fast before tokens are spent.
            </li>
            <li>
              <b>Lineage:</b> it is the tracked successor of the one-off rehearsal
              scratch (<code>.claudeweb-preview/rehearsal.mjs</code>, openspec:
              advance-queue-loop tick 5.5), which stays on disk as history only.
            </li>
          </ul>
          <p className="ca-sec__foot">
            Rule of thumb: decision logic goes in unit tests; UI truth goes in the
            browser tests; the eval suite is reserved for the choreography and agent
            behavior only it can reach. See <code>tests/loop-eval/README.md</code>.
          </p>
        </section>
      </div>
    );
  }

  // section === 'plan' — the stated gap and how we close it.
  return (
    <div className="ca ov">
      <p className="autopilot__summary">
        <b>The gap, stated plainly:</b> <code>AutopilotService</code> — the background
        tick engine that actually grabs replies and sends prompts — has <b>no cheap
        automated tests</b>. The <code>tests/loop-eval/</code> suite covers it end to
        end, but at real-token cost; what&apos;s missing is the fast layer between.
      </p>
      <section className="ca-sec">
        <h3 className="ca-sec__h">Why it&apos;s hard today</h3>
        <ul className="ov-list">
          <li>
            It is a <code>BackgroundService</code> on a 10-second timer whose
            constructor takes <b>15 concrete dependencies</b>
            (<code>CliRunnerService</code>, <code>RunSessionService</code>,
            <code> DockRegistry</code>, …) with <b>no interface seams</b> — it cannot be
            instantiated in a test without the whole app.
          </li>
          <li>
            The decision logic is already out of it (the pure
            <code> DrivenLoop.Decide</code> ladder), so what&apos;s untested is the
            <b> choreography</b>: tick → pick agent → send → watch the run → verify →
            record.
          </li>
        </ul>
      </section>
      <section className="ca-sec">
        <h3 className="ca-sec__h">The plan — one seam, then scenarios</h3>
        <ul className="ov-list">
          <li>
            <b>Extract a &quot;run one agent turn&quot; interface</b> — the single
            point where the engine talks to the CLI — so a fake runner can implement it
            with scripted replies.
          </li>
          <li>
            <b>Add a manual-tick entry point</b> so a test advances the engine
            deterministically instead of waiting on the timer.
          </li>
          <li>
            <b>Then whole scenarios run in milliseconds</b> with no CLI: deny-list
            escalation mid-queue, operator stop between steps, resume after stop,
            drain to done — the same choreography the eval suite proves for real,
            but cheap enough to run on every commit.
          </li>
        </ul>
        <p className="ca-sec__foot">
          Status: <b>planned, not started</b> — a moderate refactor of
          <code> AutopilotService</code>, not a rewrite. The eval suite
          (<code>tests/loop-eval/</code>) narrows this gap from &quot;nothing exercises
          the engine&quot; to &quot;no <i>cheap</i> regression layer&quot;; this seam is
          how the two eventually meet.
        </p>
      </section>
    </div>
  );
}
