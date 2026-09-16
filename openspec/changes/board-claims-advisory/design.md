# Design: board-claims-advisory

## D1 — One rule for the badge, computed wherever the status or the facts change

`TaskLifecycle.IsUnverified(status, verifiedStatus)` = `Rank(status) > max(Rank(doing),
Rank(verifiedStatus))`; `WarningFor(status, verifiedStatus, pushed)` renders "claimed
<status>, verified: <verified | nothing> — <reason>" (reason: "branch not on origin"
when the recorded branch is known not pushed, "no facts observed yet" when nothing was
verified). `TaskGraphService.UpdateNode` recomputes the badge whenever the status
changes (so a backward move clears it, a forward claim badges it);
`ApplyVerification` recomputes it after recording the facts (so it clears when the
verified state catches up and reads the gap when it does not); the schema-2 migration
uses the same text. `ClampClaim` / `CeilingRank` are gone — nothing clamps.

## D2 — update_task applies exactly what the arch says

`ToolUpdateTask` records the branch / commit / pr claim, then `UpdateNode` with the
requested status, and answers "task <id>: <status>" — plus "(unverified — <warning>;
the harness keeps checking …)" when the badge is on. The Operator's PATCH and the
Kanban drag/buttons take the same path. Dispatch still raises a card to doing only
(forward), never demotes.

## D3 — Verification keeps checking a claimed done

`BoardVerifier` used to skip every `done` card. Now it skips only cards whose
**verified** status is done (nothing left to verify; a leftover badge on such a card is
recomputed away). A card that says done but is verified less is checked like any
other: PR facts from GitHub, liveness from the clone — so the badge clears by itself
once the merge is confirmed live, and "Re-verify board" settles a whole batch at once.

## D4 — Surfaces

`list_tasks` adds `unverified` (bool) and `verifiedAt` beside `verifiedStatus` and
`warning`. The Kanban badge reads "⚠ unverified" with the warning as its tooltip; the
open card's warning row is unchanged. The role prompt (v9) states the rule: you move,
the harness annotates, you report unverified cards to the Operator and never move a
card back because of the badge.
