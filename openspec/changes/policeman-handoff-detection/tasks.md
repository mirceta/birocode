## 1. Build

- [x] 1.1 Vocabulary: `CardObservations.Handoff` ("Handoff pending") with its meaning; it
      needs attention; `CardObservation` gains `Target` + `FollowUpId`.
- [x] 1.2 Reader: the prompt's rule for handoff endings (the signals, what the summary and
      `target` must say); `CardReading.Target`; `Parse` reads `target`.
- [x] 1.3 Sweep: the target stamped on the card; `Handoffs.FollowUpFor` correlation every pass
      (before the transcript read) and right after a fresh handoff reading; `FollowUpId`
      recorded with `onlyIfBy: policeman`; the flag reason "ended in a handoff … (for <target>)"
      only while no follow-up exists.
- [x] 1.4 Arch: `observation.target` / `observation.followUpId` in `list_tasks` and `my_effort`;
      role prompt v13 — a pending handoff is the arch's cue to create the follow-up task.
- [x] 1.5 Card: `OBSERVATIONS.handoff`; `observationOf` → "Handoff pending — <summary> — for
      <target> · no follow-up task on the board yet …" (attention) / "Handoff tracked … ·
      follow-up card #ref exists"; data attributes; the Management App bundle rebuilt.
- [x] 1.6 Tests: `PolicemanHandoffTests` (5: the reading, the prompt + parser, the flag and its
      withdrawal, the correlation rules, tracked-at-once + replacement); vocabulary / prompt /
      parser / role-marker tests updated; `cardSections.observation.test.mjs`.

## 2. Verify

- [x] 2.1 `openspec validate policeman-handoff-detection --strict`; .NET 584/584; client 144/144.
- [x] 2.2 Headless evidence `client/tests/ui/shot-kanban-handoff.mjs` → `docs/screenshots/kanban-handoff.png`.

## 3. Ship

- [ ] 3.1 PR against main (fleet task f6179626); the Operator merges by hand; no deploy here.

## 4. Follow-up (not this change)

- [ ] 4.1 Decide whether the arch answers a handoff with a NEW card or a driven LEG on the same
      card (openspec cross-repo-effort-legs) — and let the correlation match a new leg.
- [ ] 4.2 A Kanban filter flag `handoff` (pending only).
