# Design — repo-agent subagents

The full investigation (how arch goal conversations work, the generalisation table, the animated
lifecycle, the boundaries, the risks and the build plan) is the Understanding app of this change.
The decisions in short:

- **One engine.** A subagent is a goal loop in the shared `LoopConfigStore` on key
  `<repoId>~sub~<id>` — no "#" (the lane separator), no "/" (the fleet key separator). The engine
  ticks it with a synthetic `RepositoryInfo` (the parent's checkout, the repo's provider and model),
  exactly as it ticks arch conversations with `HomeInfoFor`.
- **Own session only.** Session = the loop pin, else the record's; never "newest transcript" (that
  is the parent's). The run slot is the subagent's key, so `OnRunCompleted` never moves the parent's
  pin.
- **No ArchDrivenPolicy.** The DrivenLoop ladder's NEEDS_HUMAN stop holds the subagent (the active
  step blocked, awaitsHuman); an answer resumes the loop — the behaviour goal-step-plan designed for
  the arch.
- **One writer.** `WriterBlock` gates the engine send; `ChatController` and `StartRepoTurn` refuse
  the parent's builder turn with the subagent named.
- **Summary persisted.** Stored on the record, delivered when the parent's checkout is free, into
  the parent tab's session (else the last builder run's), tagged actor `subagent`; docks follow the
  fork.
- **Inline steps.** An agent often writes "STEP 1 — … STEP 2 — …" on one line; the markers are put
  on their own lines before the plan is derived (found by the real end-to-end).
- **UI reuse.** `owner` objects (`archOwner`, `repoOwner(repoId)`) carry paths, labels and storage
  keys; the panel's right pane is a render prop.
