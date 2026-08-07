## 1. Backend: goal arms accept a per-arm deny-list

- [ ] 1.1 `LoopConfigStore.StartGoal` gains a trailing optional `List<string>? denyList` parameter, stored via the same `CleanDenyList` path `StartQueue` uses
- [ ] 1.2 `AutopilotController` goal start call site passes `req.DenyList` (recipe call site untouched)

## 2. Frontend: deny chips on the goal arm

- [ ] 2.1 Extract the deny-chip block in `DockLoopControl.jsx` (arming chips + armed effective-list display) into a local `DenyChips` component; queue section renders it exactly as before
- [ ] 2.2 Render `DenyChips` in the goal arm section, and include `denyList: denyDropped.length > 0 ? denyEffective : undefined` in the goal arm payload
- [ ] 2.3 Confirm chip hydration from the gated detail works for a persisted goal arm (existing `mine?.denyList` logic is kind-agnostic — verify, don't assume)

## 3. Verify

- [ ] 3.1 Backend + client builds clean
- [ ] 3.2 Browser: goal arm shows the chips; dropping a term and arming stores the trimmed list; the armed goal instance's gated detail shows the effective list; an untouched goal arm shows/follows the global default
- [ ] 3.3 Browser: queue arm chips unchanged (no regression from the extraction)
- [ ] 3.4 `openspec validate expose-goal-loop-denylist --strict` passes
