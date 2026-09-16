import { OBSERVATIONS } from './cardSections';
import { BOARD_CHECK, LIFECYCLE, DRIVE, DRIVE_TABLE, PASS, CAN, CANNOT, PROVENANCE, toSvg } from './policemanDiagram';
import './policemanExplainer.css';

// "How it works" — the policeman explained, on its own tab inside the Policeman subtab
// (openspec policeman-observes-agents). Everything shown here is DATA from
// policemanDiagram.js / cardSections.js, the same words the cards use, so the explanation
// cannot drift from the product. `status` (the /api/arch/policeman payload) fills in the
// live numbers: interval, cap, how many tools it is offered.

function Diagram({ d }) {
  return (
    <figure className="pe__fig" data-explainer-diagram={d.id}>
      <figcaption>{d.title}</figcaption>
      <div className="pe__svg" dangerouslySetInnerHTML={{ __html: toSvg(d) }} />
      {d.note && <p className="pe__note">{d.note}</p>}
    </figure>
  );
}

export default function PolicemanExplainer({ status = null }) {
  const interval = Math.max(1, Math.round((status?.intervalSeconds || 300) / 60));
  const cap = Math.round((status?.contextCapTokens || 400000) / 1000);
  const tools = status?.allowedTools?.length;
  return (
    <div className="pe" data-policeman-explainer>
      <section className="pe__sec">
        <h3>What the policeman is</h3>
        <p>
          A standing arch conversation with one job: <b>keep the Kanban honest</b>. Every {interval} min it reads the
          board, every in-flight agent's last messages and every repo's pull requests, then it writes back three
          things and nothing else: what each agent is doing (<b>Agent</b> section), a card moved <b>forward to what
          GitHub proves</b>, and 🆘 <b>Needs human</b> where a person must step in. It never talks to an agent and
          never moves a card by claim. {tools ? <>It is offered {tools} tools; the arch's acting tools are withheld.</> : null}
          {' '}At {cap}k tokens of context its session is rolled over with a mechanical handover.
        </p>
      </section>

      <section className="pe__sec">
        <h3>One pass, in order</h3>
        <ol className="pe__pass" data-explainer-pass>
          {PASS.map((p) => (
            <li key={p.n}><code>{p.tool}</code><span>{p.what}</span></li>
          ))}
        </ol>
      </section>

      <section className="pe__sec">
        <h3>How it drives a card — every state, and what it does there</h3>
        <p className="pe__note">Every pass, every card lands in exactly one of these states; the action in the box is the whole of the policeman's responsibility in that state.</p>
        <Diagram d={DRIVE} />
        <table className="pe__table pe__table--drive" data-explainer-drive>
          <thead><tr><th>state</th><th>how it recognises it</th><th>what it does</th><th>what it never does</th></tr></thead>
          <tbody>{DRIVE_TABLE.map(([s, how, does, never]) => <tr key={s}><th>{s}</th><td>{how}</td><td>{does}</td><td className="pe__never">{never}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="pe__sec">
        <h3>The two state machines a card lives in</h3>
        <Diagram d={BOARD_CHECK} />
        <Diagram d={LIFECYCLE} />
      </section>

      <section className="pe__sec">
        <h3>The Agent section — what the policeman read</h3>
        <p className="pe__note">Not a state machine: the policeman's latest reading of the agent's own words, one of these, with a one-sentence summary, its name, the time and the session.</p>
        <ul className="pe__obs" data-explainer-observations>
          {Object.entries(OBSERVATIONS).map(([key, [icon, word, meaning]]) => (
            <li key={key} data-observation={key}><b>{icon} {word}</b><span>{meaning}</span></li>
          ))}
        </ul>
      </section>

      <section className="pe__sec pe__two">
        <div>
          <h3>Can</h3>
          <table className="pe__table" data-explainer-can>
            <tbody>{CAN.map(([w, d]) => <tr key={w}><th>{w}</th><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h3>Cannot</h3>
          <table className="pe__table pe__table--no" data-explainer-cannot>
            <tbody>{CANNOT.map(([w, d]) => <tr key={w}><th>{w}</th><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="pe__sec">
        <h3>Where its provenance lives</h3>
        <table className="pe__table" data-explainer-provenance>
          <tbody>{PROVENANCE.map(([w, d]) => <tr key={w}><th>{w}</th><td>{d}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
