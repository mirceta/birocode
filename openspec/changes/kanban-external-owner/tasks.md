## 1. Build

- [x] 1.1 Node: `ExternalOwner` / `ExternalOwnerAt`; `SetExternalOwner` (trim, cap, blank
      clears, no-op on the same name, withdraws the policeman's own stamp + observation);
      value equality.
- [x] 1.2 `CardDomain`: `IsExternal`, `IsHandsOff`, `HandsOffStatus` (external wins),
      `HandsOffReason`, `Refusal`, `CleanOwner` — the ONE skip rule for manual + external.
- [x] 1.3 `BoardIntegrity`: state `external` judged first; `Summary.External`; counts.
- [x] 1.4 `BoardVerifier`: skip with the "external — owned by <name>, not verified" note.
- [x] 1.5 API: `POST` / `DELETE /api/taskgraph/nodes/{id}/owner`.
- [x] 1.6 Arch: `externalOwner` / `externalOwnerAt` in `list_tasks`; `awaitingDispatch` false
      for hands-off cards; `dispatch_task` / `update_task` refuse via `CardDomain.Refusal`;
      role prompt paragraph; MCP tool descriptions.
- [x] 1.7 Policeman: `flag_needs_human` / `observe_card` / `sync_card` refuse via
      `CardDomain.Refusal`; `board_integrity` + status carry `external`; prompt steps 1, 2, 4,
      6; handover summary.
- [x] 1.8 Kanban: `ownerOf` + external Board check (`cardSections.js`); Owner section with
      "↩ Ours again"; detail control (name field + "👤 External owner" / "↩ Ours again"); Ping
      disabled; `kb__card--external` violet dotted edge; `external` filter flag; policeman
      line + Policeman panel count; explainer diagrams / tables; state machine + the
      understanding app's vendored copy; Management App bundle rebuilt.
- [x] 1.9 Tests: `ExternalOwnerTests` (backend, 7); `cardSections.owner.test.mjs`, filter
      and diagram tests (client).

## 2. Verify

- [x] 2.1 `openspec validate kanban-external-owner --strict`; .NET suite 580/580; client
      suite 125/125.
- [x] 2.2 Headless evidence `client/tests/ui/shot-kanban-external-owner.mjs` (11/11) →
      `docs/screenshots/kanban-external-owner.png`, `kanban-external-owner-detail.png`.
- [x] 2.3 Isolated instance `.claudeweb-preview/external-owner-e2e.ps1` →
      `check-external-owner-api.mjs` (10/10): set / trim / card-ref / blank refused, the
      verifier's note, the board verdict counts external and flags nothing, clear → judged
      again.

## 3. Ship

- [ ] 3.1 PR against main (fleet task 34707224), stacked on #103 (card sections) and #107
      (policeman observes / syncs cards); the Operator merges by hand; no deploy from here.

## 4. Follow-up (not this change)

- [ ] 4.1 A picker over a real roster (GitHub collaborators / fleet users) feeding the same
      endpoint.
- [ ] 4.2 The arch's `create_task` / `assign_task` refusing to assign our repo agents to an
      externally owned card (today assignment is allowed; dispatch is not).
