# queue-based-loop — tasks

## 1. Slice 1 — reorderable stash (standalone value)

- [x] 1.1 `DockRegistry.ReorderStash(tabId, orderedIds)` under the registry lock
      (missing ids ignored, last-write-wins) + `POST /api/dock/{id}/stash/reorder`
- [x] 1.2 Stash strip UI: reorder affordance (drag or up/down) + i18n/CSS
- [x] 1.3 Playwright: reorder persists across reload; builds green

## 2. Slice 2 backend — queue kind on the live stash

- [x] 2.1 `LoopConfigStore`: `KindQueue` constant; additive nullable fields
      `QueueTabId` / `VerifyEnabled` / `LastStepText` / `QueueSent` (+ verify
      phase) normalized on read; `QueueVerifyTemplate` constant;
      `StartQueue(...)` mirroring `StartGoal` (verify default ON, session pin,
      non-empty-stash guard)
- [x] 2.2 `QueueLoop.cs`: `DrivenLoop` implementation — verify-owed first;
      stash empty → `Stop("done","drained")`; else propose head item with the
      consume-on-land marker; `LOOP_DONE` in step replies ignored; bound tab
      gone → `error`
- [x] 2.3 Engine (`AutopilotService`): apply consume-on-land at the
      landed-proposal hook (drive send AND suggest pend-consumed), stamp
      `LastStepText` + enter verify phase on land, register the kind
- [x] 2.4 Verification: compose verify prompt at send time from template +
      `LastStepText`; `STEP_VERIFIED` final-line check advances,
      anything else → `Stop("escalate","step-unverified")` quoting a snippet
- [x] 2.5 API (`AutopilotController`): queue arm endpoint
      `{ tabId, mode, verifyEnabled?, maxIterations?, sessionId? }`; ungated
      projection gains `queueRemaining`/`queueSent`/phase counts; item texts +
      template only in the gated detail

## 3. Slice 2 frontend — surfaces

- [x] 3.1 `DockLoopControl`: 🗒️ Queue in the type picker — settings (mode, cap
      with 2×-per-item hint, verify toggle default on), next-up preview +
      remaining count, arm/disarm wiring
- [x] 3.2 Autopilot console Loops → **Queue tab**: per-agent queue status
      (remaining / sent / phase), settings, arm/disarm
- [x] 3.3 Dock badge + popover: remaining/sent progress + verify-phase readout;
      i18n + CSS

## 4. Verify

- [x] 4.1 Builds + isolated-port e2e: drive-mode drain → done/drained;
      item stashed mid-run gets unloaded; verified reply advances; unverified
      reply → step-unverified escalate; opt-out sends no verify turn; disarm
      keeps remaining stash + re-arm resumes; NEEDS_HUMAN mid-queue → escalate;
      cap → capped; suggest-mode pends and consumes only on human send;
      reorder-while-armed
- [x] 4.2 Playwright dock check (arm over a stash, progress badge, empty-stash
      arm refused, gate-closed non-disclosure) +
      `openspec validate --strict queue-based-loop`

## 5. Docs + honesty + wrap-up

- [x] 5.1 `docs/loop-driven-agent-convention.md`: STEP_VERIFIED contract note;
      `AutopilotOverviewView` card → built; stale "does not exist yet" copy in
      `AutopilotConsole`/dock comments
- [x] 5.2 Understanding app honesty pass + final builds + validate
