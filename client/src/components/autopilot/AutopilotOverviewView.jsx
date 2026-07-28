import '../../pages/autopilot.css';

// The "Overview" tab of the AutopilotConsole — the console's front page and the
// tab it opens on (openspec/changes/add-autopilot-overview-tab). Two jobs:
// (1) an honest inventory of the autopilot surface as it exists today, and
// (2) the plan — autopilot is THE dashboard for anything that prompts agents
// automatically, running on three everyday modes: the 💡 suggestion loop and
// the ⟳ loop engine's two kinds (📋 recipe, 🎯 goal — both built, openspec
// unify-loop-types) plus the queue-based loop it still has to grow.
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
        stated, and the three modes it runs on — one already built, two we mean
        to build — so autopilot becomes something we actually use every day.
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
            and pick the global mode: <b>suggest-only</b> (autopilot predicts
            your next routine prompt, you press send) or <b>auto-advance</b>
            (confident, non-risky prompts are sent for you).
          </li>
          <li>
            <b>Loops (Agents · Recipes)</b> — the deterministic loop engine,
            two kinds. A <b>📋 recipe loop</b> resends one stored ritual
            prompt each turn until the agent&apos;s own <b>LOOP_DONE</b>;
            armed from named <b>recipes</b> (seeded: &quot;Drive the OpenSpec
            change&quot;, &quot;Finish and ship the change&quot;). A
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
            architecture maps of the chat and autopilot subsystems, plus the
            in-app System tests runs.
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
          first-class modes shaped around how we actually drive agents. The
          suggestion loop and both loop-engine kinds (📋 recipe, 🎯 goal)
          exist today; the queue-based loop is still to build, and the loop
          engine is the seed it grows from.
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
                At the end of each armed agent&apos;s turn, the classifier
                <b> decides whether one of those prompts</b> is the right next
                thing to send — the label space is exactly your library, never
                a free-form invention.
              </li>
              <li>
                Two postures: <b>suggest-only</b> (the prediction waits for
                your press of send) or <b>auto-advance</b> (confident,
                non-risky prompts are sent for you).
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
            <p className="ov-card__tag">Line up the prompts you&apos;d send by hand anyway.</p>
            <ul>
              <li>
                You build a <b>queue of prompts</b> for an agent — the ritual
                you&apos;d otherwise babysit turn by turn (continue → play it
                back → verify → deploy → …).
              </li>
              <li>
                When the agent&apos;s turn ends, the <b>next prompt is
                auto-sent</b>; the queue drains one prompt per turn.
              </li>
              <li>
                Optionally a <b>verification step</b> runs between prompts: did
                the previous prompt actually produce what we expected? If not,
                the queue stops and escalates instead of blindly sending the
                next prompt into a broken state.
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
