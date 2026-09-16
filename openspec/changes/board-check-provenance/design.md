# Design — the Board check's provenance

## D1. One actor per writer

`BoardIntegrity.BoardCheck = "board-check"` for the mechanical judge; `BoardIntegrity.Policeman =
"policeman"` stays the conversation's. `Apply` stamps as board-check, clears only board-check, and
treats a legacy "policeman" stamp whose reason is one of the judge's two `StuckReason` forms as its
own (re-stamped while still stuck, cleared otherwise). Going manual drops both checkers' marks —
nothing polices a manual card — but never the Operator's or an agent's request. The client maps
`by: board-check` to the auto-verifier source label, so the card's wording does not change.

## D2. The journal is written by the poller, not by the verifier

`TaskVerificationPoller.VerifyOnce(trigger)` snapshots the judge's flags before, runs the verifier
and the judge, snapshots after, and records one `BoardCheckJournal.Entry` in a `finally` — so a
pass that throws is still journaled with its error. `Describe(...)` is pure (before / after flag
sets → raised / cleared) and unit-tested. The verifier and the judge stay unchanged.

## D3. Coalescing keeps the history readable and the count honest

`BoardCheckJournal.Coalesces(prev, next)`: both quiet (no move, no flag change, no error), same
trigger, same verdict counts, same flagged cards → the new pass joins the previous entry
(`Repeats++`, `LastAt`). Anything loud is its own row, and the quiet run after a loud row is a new
run. `Passes` counts every pass. `ForCard(id)` filters entries that moved, flagged, raised or
cleared the card — the card's timeline without a second index.

## D4. Triggers

startup (the first pass of the process) · timer · operator (`POST /verify`, the board's
Re-verify and the subtab's Run now) · policeman (`sync_card`). The timer's next-due time is
computed from the last timer / startup pass; an operator's or the policeman's pass does not
reschedule it.

## D5. The subtab is the policeman panel's chrome

Same bar, pill, row, views and body classes (`pm__*`), with `bc__*` for the table. The pure words
live in `boardCheck.js` (state, timing, entry summary, entry span, the explainer's data) so the
panel renders only what the tests pin. The subtab choice persists per browser like the others.

## D6. What stays

The board header keeps its one-line verdict (now under 🔎). The `integrity` payload on the board
poll is unchanged. `GET /integrity` is unchanged. The Policeman subtab is unchanged.
