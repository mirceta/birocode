# Design — Kanban board integrity

## D1. Where the policeman runs: inside the existing verifier pass

The harness already has the only place that knows the REAL facts about a card:
`BoardVerifier.VerifyOnce`, driven by `TaskVerificationPoller` (every 60 s, at startup,
and on `POST /api/taskgraph/verify`). The policeman is a second step of that same pass:

```
VerifyOnce():  BoardVerifier.VerifyOnce(paths, now)      // facts → verified state, badges
               BoardIntegrity.Apply(graph, now, window)  // verdicts → 🆘 stamps
```

So it is a *checker that reacts*, in the machinery the harness already has (a hosted
poller), not a prompting loop: no LLM turn, no dispatch, no status change. It matches the
"management-side checker" brief and reuses the verifier instead of re-probing anything.
The silence window is the board's stale window (`TaskBoard:StaleHours`, default 24 h).

## D2. The judgement (pure, `BoardIntegrity.Judge`)

Per card, in this order:

| state | rule |
|---|---|
| **manual** | `node.Manual` — not judged further |
| **dishonest** | any assignee (or the unassigned card) with `TaskLifecycle.IsUnverified(status, verifiedStatus)` — exactly the ⚠ unverified rule; the reason is the existing warning text prefixed "column ahead of reality" |
| **stuck** | an assignee that is not delivered, was pinged (`DispatchedAt`), has no PR (`PrUrl`/`PrNumber` null) and either (a) is in `todo` with a note matching `\bBLOCKED\b` (the arch's `TASK BLOCKED` relay), or (b) is in `doing`/`committed` and `now − max(DispatchedAt, UpdatedAt, VerifiedAt) > window` |
| **honest** | everything else (including delivered cards and never-pinged ones) |

A card with a PR is never stuck: it waits on review, not on the assignee (that is the
existing `stale` flag's job).

## D3. Stamping: one state, several raisers

`Node.NeedsHuman = HumanRequest(At, By, Reason, RequestId?)`, `By ∈ policeman | agent |
operator`. `BoardIntegrity.Apply`:

- stuck and no request yet → stamp `policeman`;
- not stuck and the stamp is the policeman's → clear it (`SetNeedsHuman(..., onlyIfBy:
  "policeman")`), so progress, a PR, delivery or going manual withdraws the policeman's
  verdict by itself;
- any stamp by `agent` or `operator` is never touched.

The Operator resolves from the card (`DELETE /api/taskgraph/nodes/{id}/human`) — that
clears whoever raised it. The Operator can also raise one (`POST …/human`).

**Composition with human-delegation-watchers:** `request_human` sets
`NeedsHuman(by: "agent", requestId: <request card id>)` on the work card when it files
the request card; the watcher's resolution clears it. Nothing else is needed on either
side; the badge, the filter flag and `list_tasks.needsHuman` already carry it.

## D4. Manual

`Node.Manual`/`ManualAt`, flipped by `PATCH /api/taskgraph/nodes/{id} { manual }`.
Everything that acts on cards checks it:

- `BoardVerifier`: `continue` before probing (no facts, no advance, no badge);
- `BoardIntegrity.Judge`: state `manual`; going manual also drops a policeman stamp;
- `ArchAgentService`: `awaitingDispatch` is false; `DispatchTask` (the arch's tool AND the
  board's Ping) and `ToolUpdateTask` return status `manual`; `list_tasks` carries `manual`;
- the Kanban: dashed card, ✋ chip, Ping disabled, "Back to auto" to hand it back.

Manual, needsHuman and the goal all ride the existing sync: the two node fields are part
of the node (per-id LWW by `UpdatedAt`), the goal merges like the scratchpad (LWW by
`GoalUpdatedAt`; an exact tie converges on the ordinal-greater text; an older peer's
snapshot without a goal cannot erase one).

## D5. The goal

`Board.Goal` + `Board.GoalUpdatedAt`; `SetGoal` trims, caps at 4000 chars and is a no-op
for unchanged text. `GET /api/taskgraph` returns `goal`, `goalUpdatedAt` and `integrity`
(the last verdict) so the Kanban needs no extra poll; `PATCH /api/taskgraph/goal { text }`
sets it. The arch sees `boardGoal` in `list_tasks` and its role prompt tells it to judge
the board against it and say when the state does not make sense — the LLM judgement lives
with the arch (it already reads the whole board on wake); the mechanical checks live in
the policeman.

## D6. UI

- A goal panel above the board (label, text or "no goal set", ✎ edit → textarea, ✓ Save /
  ✕ Cancel, Ctrl+Enter/Esc), with the policeman line at its right, red when anything is
  dishonest or stuck.
- Card: 🆘 `human assistance requested` chip (white on red, red left edge; title = who /
  why / when), ✋ `manual` chip (dashed card), 👮 `column ahead of reality` chip (amber
  edge) next to the existing ⚠ unverified badge; a ✋ toggle on the title row.
- Detail: the request block with "✓ Resolved", the manual line, "✋ Go manual / ↩ Back to
  auto", "🆘 Needs human".
- Filter bar: `needs human` and `manual` flags (only shown when some card carries them,
  like blocked / stale).

## D7. Tests

`BoardIntegrityTests`: honest / dishonest / stuck (silence, explicit BLOCKED, PR never
stuck, never-pinged and delivered not stuck) / manual; Apply stamps once, is idempotent,
withdraws on progress, never clears operator/agent stamps; going manual drops the
policeman's stamp and re-arms on flipping back; the verifier skips manual cards (a fake
probe advances the automatic twin only); goal set/trim/persist/no-op, LWW merge incl.
older-peer and tie; manual/needsHuman survive a reload. Client: `needs-human` / `manual`
flags in the filter model.
