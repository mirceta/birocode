# queue-loop-visibility — design

## Context

The 🗒️ queue kind (openspec: queue-based-loop) drains a dock tab's live prompt
stash head-first, consume-on-land. The mechanics are verified end-to-end, but
the operator watching a run reported exactly what the surfaces predict: "the
prompts stay where they are — I can't tell whether they were unloaded."

Three visibility gaps, one of them a real staleness bug:

1. **The strip never reconciles server-side consumption.** `DockContext`
   refreshes `/api/dock` only on mount and `visibilitychange`
   (`client/src/context/DockContext.jsx`). All stash mutations the CLIENT makes
   are optimistic, so hand-editing looks live — but when the ENGINE consumes an
   item on land, no client state changes. On a dashboard that stays visible for
   the whole run, the strip literally never shrinks. This is the root cause of
   the report.
2. **No per-item state.** The strip renders every chip identically: nothing
   marks the head as "next up", nothing shows "in flight" during the long
   work + verify window, nothing numbers the unload order. The only progress
   signal is the small sent/remaining counter on the dock loop badge.
3. **Sent items vanish without a trace.** `QueueSent` is a bare count;
   `LastStepText` keeps only the most recent step. There is no record of WHICH
   prompts already unloaded.

The operator's first instinct — import/freeze the stash into a queue object at
arm time so consumption is legible — is the alternative that queue-based-loop's
**D2 explicitly rejected** (freezing defeats accumulate-while-busy, duplicates
a list the UI renders, breaks lossless stops). This change keeps D2 and makes
the live-stash model *observable* instead.

Relevant existing plumbing (all already shipped by queue-based-loop):

- Ungated `GET /api/autopilot/loops` projects `kind`, `phase`, `active`,
  `queueTabId`, `queueRemaining` (live stash length), `queueSent` — everything
  strip marking needs, with no new disclosure.
- Gated `GET /api/autopilot/loops/detail` carries prompt-bearing fields
  (`lastStepText`, `queueVerifyTemplate`); the Dashboard polls the ungated
  projection ~5s and passes each repo's loop to its dock card.
- `LoopConfigStore` increments `QueueSent` at the single land point
  (drive send landed / suggest pend consumed).

## Goals / Non-Goals

**Goals:**

- The stash strip reconciles engine consumption while the page stays visible —
  a draining queue visibly shrinks.
- While a queue is armed on a tab, that tab's strip discloses the binding:
  unload order numbering, head marked next-up/in-flight, queue accent.
- Arm surfaces (dock popover, console Queue tab) preview the FULL ordered list
  before arming, not head + count.
- A bounded, gated sent-history of unloaded step texts, visible in the dock
  popover inspection and the console Queue tab.

**Non-Goals:**

- **No snapshot/import** — queue-based-loop D2 stands verbatim. The stash
  remains the single source of truth; this change adds zero queue state beyond
  the sent-history list.
- No change to consumption, verification, stop/re-arm semantics, endpoints, or
  the ungated disclosure surface.
- No push/SSE for dock state — polling parity with the codebase's existing
  visible-page pollers is enough at this cadence.
- No marking for the global (tab-independent) stash — it feeds no loop.

## Decisions

**D1 — Reconcile via a visible-page interval poll in DockContext, guarded
against clobbering in-flight optimistic edits.** `DockContext` gains a ~10s
`setInterval` (visible page only, cleared on hide) around the existing
`refresh()`, mirroring `ChatContext`'s visible-page run poll. To keep the
optimistic add/remove/reorder UX intact, `refresh()` is skipped while any stash
mutation POST/DELETE is in flight (a simple pending-request counter ref) — the
next tick converges. Alternatives considered: (a) piggyback on the Dashboard's
existing poll and push its data into DockContext — rejected, fixes only the
dashboard surface (the main chat strip stays frozen) and tangles two data
paths; (b) per-strip conditional pollers keyed on queue-armed state — rejected,
the armed state itself arrives by polling, so the fix would race its own
trigger, and `/api/dock` is a cheap in-memory read. The interval also makes
Agents-page and dash-cell stash badges converge for free.

**D2 — Strip marking is derived, prop-injected where loop data already flows,
hook-fetched where it doesn't.** `ChatInput` gets an optional `queueLoop` prop
`{active, phase, queueTabId}`. When present, `queueLoop.active &&
queueLoop.queueTabId === queueTabId`, the strip renders queue-armed: chips
numbered in order, chip 1 badged "▶ in flight" while `phase` is `work`/`verify`
(the head is what the engine is executing or verifying) and "next up"
otherwise, plus a strip-level accent class. Dashboard docks pass the loop they
already receive (Dashboard poll → `PinnedAgent` → `Chat` → `ChatInput`). The
main Chat page, which polls no loop data, uses a small `useQueueLoopStatus`
hook: fetch ungated `/api/autopilot/loops` on a ~10s visible-page interval ONLY
while a tab is active and its stash is non-empty — bounded, and idle exactly
when there is nothing to mark. Alternative — join loop state into the `/api/dock`
projection so DockContext carries it: rejected, reverses the module dependency
(dock would read autopilot state) for no disclosure gain.

**D3 — Sent history: bounded `QueueSentTexts` on the loop record, appended at
the land point, gated like all prompt text.** `LoopConfigStore` adds
`List<string> QueueSentTexts` (cap 20, drop-oldest, newest last), appended in
the same mutation that increments `QueueSent` — so drive lands and
suggest-consumed pends are both covered, and the list survives restarts with
the record. Reset to empty on queue arm (a new arm is a new ritual; the old
run's history remains in the audit trail). Exposed in the gated
`/loops/detail` projection and the debug bundle (redacted-when-closed like
`lastStepText`); the ungated projection is untouched. Rendered as "sent ✓"
rows in `DockLoopControl`'s queue inspection pane and the console Queue tab,
labeled honestly as "last N" when truncated. Alternative — derive from the
audit trail: rejected; suggest-mode lands are human sends the loop audit does
not record, and verification turns would need filtering by prompt-text
parsing.

**D4 — Arm preview: render the full stash list the component already holds.**
`DockLoopControl`'s queue section replaces the head-only `<pre>` with a
numbered, scroll-capped (`max-height`) list of every stash item — "these N
will unload, in this order" — reusing the live `stash` prop; reordering in the
strip immediately reorders the preview. Same treatment in `LoopsView`'s Queue
arm form (its tab picker already carries each tab's stash). No new data, no
gating question: tab stash texts are already session-auth dock data on both
surfaces.

## Risks / Trade-offs

- [Interval poll clobbers an optimistic edit mid-flight] → pending-mutation
  counter skips reconcile while a stash POST/DELETE is outstanding; worst case
  a 10s-later tick restores server truth, which is the desired convergence.
- [More background traffic from two new ~10s visible-page pollers] → both are
  visibility-gated and one is additionally condition-gated (active tab +
  non-empty stash); both hit cheap in-memory endpoints. The traffic-monitor
  effort, if it lands, dedupes pollers globally — nothing here fights it.
- [Head-item marking can mislabel during a race: the head chip shown "in
  flight" was reordered away after the engine read it] → the engine consumes
  by item id on land, so the strip converges on the next poll; the badge is a
  ~10s-fresh status, not a transaction log. Accepted.
- [Sent history cap loses early items on long queues] → the UI labels the list
  "last N"; the full trail stays in the audit log. Accepted for record size.
- [`QueueSentTexts` grows the persisted loops.json] → bounded at 20 short
  operator prompts per repo; negligible.

## Migration Plan

Additive only: new nullable/list fields on the loop record (absent in old JSON
→ empty), new optional props/hook client-side. No endpoint or schema breaks;
deploy is the standard swap.ps1 cycle. Rollback = redeploy previous build;
records written with `QueueSentTexts` deserialize fine on the old build (extra
JSON member ignored).

## Open Questions

None — sized as one slice (backend field + projections, then the three UI
surfaces, then verify).
