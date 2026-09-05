## 1. Build

- [x] 1.1 `ArchLoop.Decide`: NEEDS_HUMAN → `Hold(escalate, label = question)` when no
      wake; a wake still proposes. `PendingQuestion` helper.
- [x] 1.2 `LoopConfigStore`: arch cap default 0 (uncapped), clamp 0..100 for arch on
      arm and on the cap setter; `ResumeArch` (re-activate in place, fresh generation).
- [x] 1.3 `ArchAgentService`: `SendToArch` resumes an escalated/capped loop (watermark →
      now); role prompt v4 (keeps being woken while a question waits).
- [x] 1.4 `ArchController.BuildState`: engine `label`; `Arch.jsx`: cap default 0 with
      "0 = no cap", "waiting for you" banner from the escalated hold.

## 2. Tests

- [x] 2.1 `ArchAgentTests`: NEEDS_HUMAN without a wake → escalated hold naming the
      question; with a wake → propose; stop/error still stop; arch default cap 0 and 0
      accepted; `ResumeArch` reactivates an escalated instance and no other.

## 3. Verify + ship

- [x] 3.1 `dotnet build`, `dotnet test`, client build, `openspec validate --strict`.
      DONE 2026-09-05: build clean, tests 233/233, client + Management App bundles built,
      change valid under --strict.
- [ ] 3.2 Deploy with `swap.ps1` on the Operator's instruction; confirm on live that a
      NEEDS_HUMAN reply leaves the loop armed and shows the banner.
