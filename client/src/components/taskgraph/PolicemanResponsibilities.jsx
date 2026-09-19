import { useMemo, useState } from 'react';
import { GROUPS, COLUMNS, RULES, VOCABULARY, allRows, filterRows } from './policemanDuties';
import './policemanResponsibilities.css';

// The Policeman tab's "Responsibilities" view (openspec policeman-responsibilities-tab): the
// table of "the card is in state X, the conversation / the facts say Y → the policeman does Z,
// and this is what you see next", grouped in the order the pass runs, with a filter box and the
// reading vocabulary. Data lives in policemanDuties.js (the file name differs from this component's on purpose: on a case-insensitive disk the bundler resolved ./PolicemanResponsibilities to the .js first) (node-tested, every row names
// the code it is read from); this file only renders it.

export default function PolicemanResponsibilities() {
  const [q, setQ] = useState('');
  const groups = useMemo(() => filterRows(q), [q]);
  const shown = allRows(groups).length;
  const total = allRows().length;
  return (
    <div className="pr" data-policeman-duties>
      <div className="pr__head">
        <p className="pr__lead">
          <b>What the policeman does, situation by situation.</b> One pass every {RULES.passEverySeconds} s (and at startup, and on ▶ Run now): trace → facts → move → judge → read → flag → journal.
          Each row: the card’s state, what the conversation says or the facts show, what the policeman does, and what you see next. Every row names the code it is read from.
        </p>
        <label className="pr__filter">
          🔎 <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter — e.g. handoff, blocked, ahead of the facts, never" data-policeman-duties-filter />
          <span className="pr__count" data-policeman-duties-count>{shown === total ? `${total} rules` : `${shown} of ${total} rules`}</span>
        </label>
      </div>
      {groups.length === 0 ? <div className="pm__empty" data-policeman-duties-empty>No rule mentions “{q}”. Try one word.</div> : groups.map((g) => (
        <section key={g.key} className="pr__group" data-policeman-duties-group={g.key}>
          <h3 className="pr__title">{g.title} <span className="pr__n">{g.rows.length}</span></h3>
          <p className="pr__glead">{g.lead}</p>
          <table className="pr__table">
            <thead><tr>{COLUMNS.map(([k, label]) => <th key={k} className={`pr__th pr__th--${k}`}>{label}</th>)}</tr></thead>
            <tbody>
              {g.rows.map((row, i) => (
                <tr key={i} className="pr__row" data-policeman-duty>
                  <td className="pr__card">{row.card}</td>
                  <td className="pr__says">{row.says}</td>
                  <td className="pr__does">{row.does}</td>
                  <td className="pr__then">{row.then}<div className="pr__src" title="where this rule lives in the harness code">{row.source}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!q && (
        <section className="pr__group" data-policeman-duties-vocab>
          <h3 className="pr__title">The reading vocabulary — the only words the model may answer with</h3>
          <p className="pr__glead">The card’s Agent section, the Sweep’s 🧠 column and this table all use the same eight words; an answer outside them is discarded and the card keeps its previous reading.</p>
          <table className="pr__table pr__table--vocab">
            <tbody>{VOCABULARY.map(([key, icon, word, meaning]) => <tr key={key}><th className="pr__vword">{icon} {word}</th><td className="pr__vkey"><code>{key}</code></td><td>{meaning}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
