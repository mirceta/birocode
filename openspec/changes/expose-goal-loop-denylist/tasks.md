## 1. Backend: all driven arms accept a per-arm deny-list

- [ ] 1.1 `LoopConfigStore.StartGoal` and `StartRecipe` gain a trailing optional `List<string>? denyList` parameter, stored via the same `CleanDenyList` path `StartQueue` uses
- [ ] 1.2 `AutopilotController` goal and recipe start call sites pass `req.DenyList` (suggestion untouched)

## 2. Frontend: one shared deny block at the top of the loop section

- [ ] 2.1 Extract the deny-chip block in `DockLoopControl.jsx` (arming chips + armed effective-list display) into a local `DenyChips` component
- [ ] 2.2 Render `DenyChips` once at the top of the expanded loop section (above the kind sections); remove the queue section's copy
- [ ] 2.3 Include `denyList: denyDropped.length > 0 ? denyEffective : undefined` in the goal and recipe arm payloads (queue already sends it)
- [ ] 2.4 Label the block as scoped to "this arm" (i18n label/hint) so it is not mistaken for the global-list editor in the Autopilot console
- [ ] 2.5 Confirm chip hydration from the gated detail works for persisted goal and recipe arms (existing `mine?.denyList` logic is kind-agnostic — verify, don't assume)

## 3. Verify

- [ ] 3.1 Backend + client builds clean
- [ ] 3.2 Browser: chips appear once at the top of the expanded loop section; dropping a term and arming a goal loop stores the trimmed list; the armed instance's effective list shows in the shared spot (gated); an untouched arm follows the global default
- [ ] 3.3 Browser: queue arm path unregressed — arm with a trim, effective list shown, resume path intact; recipe arm honors the trim
- [ ] 3.4 `openspec validate expose-goal-loop-denylist --strict` passes
