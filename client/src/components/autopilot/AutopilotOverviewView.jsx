import '../../pages/autopilot.css';

// The "Overview" tab of the AutopilotConsole — the console's front page and the
// tab it opens on (openspec/changes/add-autopilot-overview-tab). Two jobs:
// (1) an honest inventory of the autopilot surface as it exists today, and
// (2) the plan — autopilot is THE dashboard for anything that prompts agents
// automatically, running on three everyday modes: the 💡 suggestion loop and
// the ⟳ loop engine's kinds (📋 recipe, 🎯 goal — openspec unify-loop-types —
// and 🗒️ queue — openspec queue-based-loop). All built.
//
// Pure static reference content: no backend calls, nothing here can act — which
// is also why the console renders this tab even while the operator gate is
// closed, unlike every operational tab.

export default function AutopilotOverviewView() {
  return (
    <div className="ca ov">
      <p className="autopilot__summary">
        <b>Autopilot is the dashboard for anything that prompts your agents
        automatically.</b> This page is its map: what exists today, honestly
        stated, and the three modes it runs on — all built now — so autopilot
        becomes something we actually use every day.
      </p>

      <section className="ca-sec">
        <h3 className="ca-sec__h">What&apos;s here today</h3>
        <p className="ca-sec__p">
          Every piece below is built, fenced and verified. The old adoption
          gap — loops started from a blank form in the wrong place, driven
          agents had no output contract, loop state was invisible on the
          dashboard — has been closed (openspec: adopt-autopilot-loops):
          loops now arm one-tap from a dock card via named <b>recipes</b>,
          driven agents follow the documented sentinel /
          <code> NEEDS_HUMAN:</code> contract
          (<code>docs/loop-driven-agent-convention.md</code>), and every stop
          records <b>why</b>. What remains is real-world tuning.
        </p>
        <ul className="ov-list">
          <li>
            <b>Suggestion-based loop → Control</b> — arm or disarm each agent
            and pick the global mode: <b>suggest-only</b> (the brain&apos;s best
            candidate always pre-fills your composer with its honest confidence,
            even below the threshold — you press send) or <b>auto-advance</b>
            (only confident, non-risky prompts are sent for you). The classifier
            is a one-shot Claude call by default (the <b>Claude brain</b> toggle;
            an offline word-overlap stub is its fallback).
          </li>
          <li>
            <b>Loops (Agents · Queue · Recipes)</b> — the deterministic loop
            engine, three kinds. A <b>📋 recipe loop</b> resends one stored
            ritual prompt each turn until the agent&apos;s own <b>LOOP_DONE</b>;
            armed from named <b>recipes</b> (seeded: &quot;Drive the OpenSpec
            change&quot;, &quot;Finish and ship the change&quot;). A
            <b> 🗒️ queue loop</b> drains a dock tab&apos;s prompt stash step
            by step with a <b>STEP_VERIFIED</b> check between items. A
            <b> 🎯 goal loop</b> takes your free-text goal and, on the
            agent&apos;s done-claim, sends a <b>verification turn</b> — only
            <code> GOAL_VERIFIED</code> stops it as done. Both escalate on
            <code> NEEDS_HUMAN:</code> or a deny-listed word, stop at the
            iteration cap, and record why they stopped. Arming is
            <b> exclusive per agent</b> and lives in the dock card&apos;s
            unified control (type picker, prompt inspection, one Disarm),
            where a live badge shows looping n/cap and terminal states even
            while the gate is closed.
          </li>
          <li>
            <b>Suggestion-based loop → Prompt library</b> — the editable
            library that is the recommender&apos;s entire label space, plus
            drafts mined from your chat history across repos.
          </li>
          <li>
            <b>Live feed · History · Audit</b> — the observability
            surfaces: a live feed of every agent reply the engine grabs, every
            prediction it made, and — cross-loop-type, hence its own root
            tab — the append-only record of every prompt autopilot actually
            sent, each marked as a suggestion send or a loop resend.
          </li>
          <li>
            <b>Reference</b> — the two interactive &quot;How … works&quot;
            architecture maps of the chat and autopilot subsystems.
          </li>
          <li>
            <b>🧪 Tests</b> — the stated coverage map of the loop engine
            (openspec: add-autopilot-tests-tab): the unit-test layer, the
            in-app runnable browser tests, the end-to-end rehearsal layer,
            and the honest gap + plan for the untested tick engine.
          </li>
          <li>
            <b>Safety posture</b> — the whole API sits behind the operator gate
            (host PC only, off by default), with the deny-list, hard iteration
            caps and the audit trail on top. This Overview is the one surface
            the gate never hides.
          </li>
        </ul>
      </section>

      <section className="ca-sec">
        <h3 className="ca-sec__h">The plan — three modes for every day</h3>
        <p className="ca-sec__p">
          Autopilot keeps one identity — the home of automatic prompting — and
          instead of more disconnected machinery it settles on three
          first-class modes shaped around how we actually drive agents. All of
          them exist today: the suggestion loop and the loop engine&apos;s three
          kinds — 📋 recipe, 🎯 goal, and the 🗒️ queue loop that drains an
          agent&apos;s stashed prompts.
        </p>
        <div className="ov-features">
          <article className="ov-card">
            <h4 className="ov-card__name">💡 Suggestion-based loop</h4>
            <p className="ov-card__tag">Already built — teach it your prompts; it decides when to send them.</p>
            <ul>
              <li>
                You maintain a small set of <b>custom routine prompts</b> — the
                editable library in the Prompt library subtab.
              </li>
              <li>
                At the end of each armed agent&apos;s turn, the classifier — a
                one-shot Claude call on a fast model (stub matcher as fallback) —
                <b> decides whether one of those prompts</b> is the right next
                thing to send — the label space is exactly your library, never
                a free-form invention.
              </li>
              <li>
                Two postures: <b>suggest-only</b> (the best candidate always
                pre-fills the composer with its confidence; you press send) or
                <b> auto-advance</b> (confident, non-risky prompts are sent for
                you — the threshold gates only these sends). The dock&apos;s loop
                popover shows the engine&apos;s live decision and why.
              </li>
              <li>
                This is the one mode that <b>exists today</b> — the Control +
                Prompt library machinery under its own root tab. Its remaining
                work is trust and tuning, not construction.
              </li>
            </ul>
          </article>
          <article className="ov-card">
            <h4 className="ov-card__name">🎯 Goal loop</h4>
            <p className="ov-card__tag">Built — give one agent a goal, not a stream of prompts.</p>
            <ul>
              <li>
                You state a <b>free-text goal</b> in the dock card&apos;s loop
                control; the composed work and verification prompts are
                inspectable byte-identical before arming.
              </li>
              <li>
                The driven agent receives, with the goal, the
                <b> output contract</b> — it knows from turn one what
                &quot;done&quot; has to look like
                (<code>docs/loop-driven-agent-convention.md</code>).
              </li>
              <li>
                On the agent&apos;s done-claim the loop sends a
                <b> verification turn</b>: re-check the goal against the actual
                repo state and answer <code>GOAL_VERIFIED</code> — or list what
                is missing and keep working. Only a verified confirmation stops
                the loop as done.
              </li>
              <li>
                Explicit <b>stopping conditions / max turns</b> bound the loop:
                verified done, escalation, or the cap — never a hunch.
              </li>
              <li>
                Still to grow: an <b>independent background verifier</b> (today
                the verification turn runs in the driven agent&apos;s own
                session) and an optional deterministic
                <b> <code>checks.ps1</code></b> pass beside it.
              </li>
            </ul>
          </article>
          <article className="ov-card">
            <h4 className="ov-card__name">🗒️ Queue-based loop</h4>
            <p className="ov-card__tag">Built — line up the prompts you&apos;d send by hand anyway.</p>
            <ul>
              <li>
                The queue IS the agent&apos;s <b>prompt stash</b> — the strip
                under the dock&apos;s chat box. Stash prompts, reorder them,
                add more mid-run; the loop always unloads the top item next.
              </li>
              <li>
                When the agent&apos;s turn ends, the <b>next prompt is
                auto-sent</b>; an item leaves the stash only when its send
                actually fires, so disarming mid-way loses nothing.
              </li>
              <li>
                A <b>verification turn</b> runs between steps (on by default):
                the agent must confirm <code>STEP_VERIFIED</code>, otherwise
                the queue stops and escalates instead of sending the next
                prompt into a broken state.
              </li>
              <li>
                The arm form <b>names its binding</b> (&quot;drives &lt;repo&gt; ·
                N queued&quot; — the first prompt fires when the agent is next
                free), and the <b>deny-list is trimmable per arm</b> (whole-word
                matching; drop <code>push</code> for a commit-and-push repo
                without touching the global default).
              </li>
              <li>
                A stopped queue with items left offers one-tap <b>Resume</b> —
                same instance, current head, fresh iteration budget; pressing
                Stop on the agent&apos;s run records honestly as
                <b> stopped · by-operator</b>, never as an agent error.
              </li>
            </ul>
          </article>
        </div>
        <p className="ca-sec__foot">
          All three modes run behind the unchanged safety posture — the host-only
          operator gate, deny-list escalation, hard caps and the append-only
          audit trail.
        </p>
      </section>
    </div>
  );
}
