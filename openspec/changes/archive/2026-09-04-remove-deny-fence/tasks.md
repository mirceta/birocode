## 1. Server

- [x] 1.1 Config store: drop `DenyList` + forced defaults; snapshot without it.
- [x] 1.2 Loop store: drop per-arm `DenyList` (entry, state, Start/StartGoal/StartQueue params, CleanDenyList, ToState).
- [x] 1.3 Ladder (`DrivenLoop.Decide`): no reply-word stop; `LoopContext` without `DenyList`.
- [x] 1.4 Classifiers: stub + CLI `Classify` without a deny list; `Verdict.Denied` and `ContainsWholeWord` removed; suggestion loop no longer checks `Denied`.
- [x] 1.5 Arch: `DenyFence` + call sites and the fleet-send word check removed; `AuditOutcomeDenied` removed.
- [x] 1.6 Controller: `LoopRequest.DenyList` and the three `denyList` response fields removed.

## 2. Client

- [x] 2.1 Agents view strip, console Queue-tab chips, dock loop control chips + i18n keys removed.
- [x] 2.2 Explainer: deny node/edges, simulator step, prose, safety-fence table row removed.

## 3. Docs + specs

- [x] 3.1 `docs/loop-driven-agent-convention.md`, `docs/event-feed-contract.md` updated.
- [x] 3.2 Delta specs: autopilot-loops (3 REMOVED, 3 MODIFIED), arch-agent (1 MODIFIED), autopilot-explainer (1 MODIFIED).

## 4. Verification

- [x] 4.1 `dotnet test` green with the rewritten tests (risky words in a reply → hold; NEEDS_HUMAN still escalates; footer opt-in tests keep passing).
- [x] 4.2 `vite build` clean; isolated instance (`.claudeweb-preview/no-deny-e2e.ps1`): `/api/autopilot`, `/api/arch` and `loops/detail` carry no `denyList`; an arm request with `denyList` in the body is answered by the operator gate only (403 gate-closed on the isolated box — never a deny refusal); the console renders with no deny-list wording, no chips, no page errors.
- [x] 4.3 Live (after deploy 2026-09-04 12:08): an armed arch send whose text contained
      "push", "merge", "delete" and "deploy" passed every local check (no `denied`); the
      only refusal came from MONSTER's harness, which still runs the pre-removal build and
      applied ITS deny list ("deploy"). Local half proven; the remote half clears when
      MONSTER redeploys main after PR #62.
