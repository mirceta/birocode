import '../../pages/autopilot.css';

// The documentation subtabs of the 🧪 Tests root tab (openspec:
// add-autopilot-tests-tab) — the stated map of what automated test coverage the
// loop engine has, so the inventory lives in the app instead of chat history.
// Three sections: the unit-test layer, the end-to-end rehearsal layer, and the
// honest coverage gap + the plan to close it. The fourth subtab (runnable
// browser tests) is the existing SystemTestsView, rendered by the console.
//
// Pure static reference content: no backend calls. Every fact below cites the
// real file it describes — when the code moves, move this with it.

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
          The slow, honest layer: an <b>end-to-end rehearsal</b> that drives the
          <b> real engine with real Claude turns</b> on a scratch repo — arm a queue
          loop, let it drive and verify, stop it mid-run as the operator, resume, and
          drain to <code>done · drained</code>. It exercises the tick → send →
          watch-run → verify choreography that nothing else touches.
        </p>
        <section className="ca-sec">
          <h3 className="ca-sec__h">What it is — and what it costs</h3>
          <ul className="ov-list">
            <li>
              <b>Scratch scripts, not a committed suite.</b> The rehearsal script
              (<code>.claudeweb-preview/rehearsal.mjs</code>) and the focused browser
              check (<code>.preview-test/queue-loop-advance-check.mjs</code>) are
              <b> untracked scratch</b>, rewritten per feature. The committed cousins
              live in <code>.claudeweb-preview/playwright/</code> — the per-feature
              verify scripts, four of which are runnable from the <b>Browser (System
              tests)</b> subtab.
            </li>
            <li>
              <b>It runs against an isolated instance</b> on the preview port (:5200)
              with a copied data dir — never against live.
            </li>
            <li>
              <b>It spends real agent turns and real minutes</b>, so it is a
              before-shipping gate for loop changes, never CI. A green rehearsal is
              recorded in the change&apos;s tasks (see openspec:
              advance-queue-loop, ticks 5.4/5.5).
            </li>
          </ul>
          <p className="ca-sec__foot">
            Rule of thumb: decision logic goes in unit tests; UI truth goes in the
            browser tests; the rehearsal is reserved for the choreography only it can
            reach.
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
        tick engine that actually grabs replies and sends prompts — has <b>no automated
        tests</b>. Today only the manual rehearsal exercises it.
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
            drain to done.
          </li>
        </ul>
        <p className="ca-sec__foot">
          Status: <b>planned, not started</b> — a moderate refactor of
          <code> AutopilotService</code>, not a rewrite. It becomes worth paying for as
          loop kinds keep growing; until then this page is the honest record that the
          gap exists.
        </p>
      </section>
    </div>
  );
}
