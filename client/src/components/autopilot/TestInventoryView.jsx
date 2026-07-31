import '../../pages/autopilot.css';

// The documentation subtabs of the 🧪 Tests root tab (openspec:
// add-autopilot-tests-tab, updated by add-loop-eval-suite) — the stated map of
// what automated test coverage the loop engine has, so the inventory lives in
// the app instead of chat history. Three sections: the unit-test layer, the
// end-to-end eval layer, and the honest coverage gap + the plan to close it.
// The fourth subtab (runnable browser tests) is the existing SystemTestsView,
// rendered by the console.
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
          The slow, honest layer: the <b>committed eval suite in
          <code> tests/loop-eval/</code></b> (openspec: add-loop-eval-suite) drives the
          <b> real engine with real Claude turns</b> on committed fixture repos and
          asserts the outcomes mechanically — the one layer that can answer
          <i> &quot;does the loop actually drive an agent to the goal?&quot;</i>
        </p>
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
          <h3 className="ca-sec__h">How it runs — and what it costs</h3>
          <ul className="ov-list">
            <li>
              <b>Fully isolated:</b> binaries copied outside the repo tree, own port
              (:5210), fresh data dir with the gate + kill switch seeded before boot —
              never against live. Everything after boot goes through the shipped API,
              exactly as an operator would.
            </li>
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
