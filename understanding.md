# Understanding — seamless feature lifecycle (kickoff & closeout)

## The problem (as I understand it)
Both ends of a feature's life are a manual ritual you re-explain every time, and
the agent forgets steps if they aren't restated:

- **Kickoff:** open a `feature/<name>` branch, add the plan file + a `plan.md`
  dashboard entry, write `understanding.md`, then start the build→verify cycle.
- **Closeout:** once it's built/deployed/confirmed, "finish it off per our flow"
  — disarm the rollback, keep-it bookkeeping (mark plan shipped, move to Recently
  shipped), retire `understanding.md`, merge to main + push, tidy the branch.

You want **both** to be seamless — start the next feature and close out the
finished one without re-describing the whole dance.

## Approach (decided)
Same mechanism as the Understanding panel (slice 2) / Exposure "Fix with an
agent": **composer-prefill buttons**. A button by the chat box calls
`ChatContext.prefillProjectChat(text)` to drop a ready-made prompt into the
composer (no extra model call); you review/edit and send.

- **Kick off a feature** button → fills the composer with the kickoff ritual
  (branch off main, plan file + `plan.md` entry, `understanding.md`, playback).
- **Close out** button → fills it with the closeout ritual (disarm rollback,
  keep-it bookkeeping, retire `understanding.md`, merge to main + push, tidy).

The canned prompt text is the ritual's single source of truth, so the agent
stops forgetting steps.

## Status
Approach written into `plans/feature-kickoff.md`; **not built yet**. Open
build-time questions: prompt source (client const vs. server-built), exact
button placement, gating, and whether closeout is static or branch-aware.
