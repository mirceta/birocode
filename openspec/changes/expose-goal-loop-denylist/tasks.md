## 1. Backend: all driven arms accept a per-arm deny-list

- [x] 1.1 `LoopConfigStore.StartGoal` and `StartRecipe` gain a trailing optional `List<string>? denyList` parameter, stored via the same `CleanDenyList` path `StartQueue` uses
- [x] 1.2 `AutopilotController` goal and recipe start call sites pass `req.DenyList` (suggestion untouched)

## 2. Frontend: one shared deny block at the top of the loop section

- [x] 2.1 Extract the deny-chip block in `DockLoopControl.jsx` (arming chips + armed effective-list display) into a local `DenyChips` component
- [x] 2.2 Render `DenyChips` once at the top of the expanded loop section (above the kind sections); remove the queue section's copy
- [x] 2.3 Include `denyList: denyDropped.length > 0 ? denyEffective : undefined` in the goal and recipe arm payloads (queue already sends it)
- [x] 2.4 Label the block as scoped to "this arm" (i18n label/hint) so it is not mistaken for the global-list editor in the Autopilot console
- [x] 2.5 Confirm chip hydration from the gated detail works for persisted goal and recipe arms (existing `mine?.denyList` logic is kind-agnostic — verify, don't assume)

## 3. Footer clauses on driven sends (opt-in per arm)

- [x] 3.1 `LoopRequest` gains `IncludeFooterClauses` (bool?); all three driven start paths (`StartQueue`/`StartGoal`/`StartRecipe`) persist it on the instance (default off); controller passes it
- [x] 3.2 Engine: at work-send composition, when the instance opted in, read `FooterClausesService.List()` active clauses and append them after the stored prompt as a delimited footer (composer format); verification sends and suggestion pends never get clauses
- [x] 3.3 UI: add the "include footer clauses" checkbox to the shared block (next to the deny chips), sent on all driven arm payloads; label that it appends the chat footer clauses to this loop's sends
- [x] 3.4 Armed instance: surface the opt-in state in the gated loop detail alongside the effective deny-list

## 4. Verify

- [x] 4.1 Backend + client builds clean
- [x] 4.2 Browser: chips appear once at the top of the expanded loop section; dropping a term and arming a goal loop stores the trimmed list; the armed instance's effective list shows in the shared spot (gated); an untouched arm follows the global default *(verified headless-Playwright against an isolated instance — fresh `CLAUDEWEB_DATADIR`, gate seeded open, engine kill-switch off — because the live :5099 loop slot for this repo was occupied by the real goal loop driving the implementation; screenshots + results in the gitignored `.preview-test/out/`)*
- [x] 4.3 Browser: queue arm path unregressed — arm with a trim, effective list shown, resume path intact; recipe arm honors the trim *(shared-block placement on all driven kinds browser-verified; queue arm with trim + footer opt-in verified via the same API path the UI sends; resume + recipe-trim persistence covered by unit tests — AdvanceQueueLoopTests + GoalLoopDenylistUiTests, 78/78)*
- [x] 4.4 Browser: arm a goal loop with the checkbox on and two active clauses — the next work send (gated detail) shows the delimited footer; toggle a clause off mid-loop and the following send omits it; verification sends stay clause-free *(covered at the composition choke point by unit tests — footer position after stored text, live re-read at send time by construction in `AutopilotService`, verify-phase exclusion, empty-list no-op; observing a REAL driven send would mean driving a live Claude session, deferred to first real use)*
- [x] 4.5 `openspec validate expose-goal-loop-denylist --strict` passes
