## 1. Build

- [x] 1.1 `ArchDrivenPolicy` (pure): needs-human → escalated hold; repeat of the last
      sent prompt → hold until a wake; new prompt / phase change → pass through.
- [x] 1.2 Engine: apply the policy for driven kinds on `@arch`; remember the last
      prompt sent per key; MCP config, tool denials, session note and wake commit keyed
      on the reserved id (not the kind); a null pin no longer skips the send for `@arch`;
      restore the standing loop after a driven `@arch` instance resolves.
- [x] 1.3 `ArchStateStore` standing-loop memory (mode, cap); `ArchAgentService.Arm`
      remembers, `Disarm` forgets, `RestoreStandingLoopIfNeeded` re-arms.
- [x] 1.4 `AutopilotController`: `@arch` pins the arch session; suggestion/queue refused
      for it; stop/disarm on `@arch` restores (driven) or forgets (arch kind).
- [x] 1.5 Client: `DockLoopControl` takes a `kinds` prop; the Arch page reads
      `/autopilot/loops` for the `@arch` row, mounts the control (goal · recipe), shows
      the driven pill and the paused note; the loop control's stylesheet is imported.

## 2. Tests

- [x] 2.1 `ArchDrivenLoopTests`: policy table (hold on question, pass-through stops,
      immediate first/new/phase sends, wake-paced repeats), standing-loop memory round
      trip, goal displaces and StartArch restores under the same key.

## 3. Verify + ship

- [x] 3.1 `dotnet build`, `dotnet test`, client + Management App builds,
      `openspec validate --strict`.
      DONE 2026-09-05: build clean, tests 240/240 (7 new), both bundles built, change valid.
- [x] 3.2 Browser check on an isolated instance (gate open, kill switch OFF so nothing
      is sent): arm the standing loop, arm a goal on `@arch` from the Arch page control,
      see the driven pill + paused note and the `@arch` row in `/autopilot/loops`, disarm
      the goal, see the standing wake loop back. Detached, `@@ARCHDRIVEN@@` marker.
      DONE 2026-09-05 23:41 — `@@ARCHDRIVEN@@ pass:true, 25 checks` (log
      `.claudeweb-preview/out-arch-driven.log`, evidence stamp 2026-09-05T21-40-58):
      suggestion/queue refused, goal armed via the dock endpoint, listed in the projection,
      engine paused (0 sends), card + pill + paused note on the Arch page, picker offers
      goal · recipe only, disarm restores the wake loop, operator Stop forgets it.
