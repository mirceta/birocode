# Design — OR patterns in the Status tab's agent filter

## One helper, one list

`FleetStatus.jsx` filters once (`scoped`) and every view reads the result, so the whole
change is in `agentQuery.js`:

- `parseAgentQuery(q)` → `[[word…], …]`: split on `|` and `,`, trim, split each alternative
  on whitespace, drop empty alternatives. `"prg | webflow"` → `[["prg"], ["webflow"]]`;
  `"prg |"` → `[["prg"]]`; `""` → `[]` (= no filter).
- `patternMatches(hay, word)`: plain substring first; if the word holds `*`, a regex with
  `.*` for each star (everything else escaped); if the plain substring misses, compare with
  `-`, `_`, `.` and spaces stripped from both sides (`webflow` ↔ `web-flow-autodev1`).
- `matchesAgentQuery(a, machine, q)`: `alternatives.some(words => words.every(match))`.

Why the separator-insensitive fallback: the brief's example is literally `webflow` for an
agent called `web-flow-autodev1`; without it the OR would "work" and still show nothing for
the Operator's own example. It only widens — the plain substring is tried first — so a
single pattern keeps every match it had.

Why `,` as well as `|`: the brief allows either; `|` is on a phone keyboard's second page,
`,` is on the first.

## The hint

Placeholder + tooltip on the box, and a small `.fs__search-hint` span beside it; no new state,
no new persistence — the stored `q` is the same string it always was.

## Verification

- Node tests on the helper (no DOM).
- The shot over the real fleet snapshot of this hub (fixture committed, sanitized: no account
  stamps / overview / stale tasks) — types each form, reads the chips, the "n of m" count and
  the state chips' counts, reloads for persistence.
