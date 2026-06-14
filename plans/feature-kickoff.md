# Feature kickoff & closeout — a seamless feature lifecycle

> **Status (2026-06-14):** PLAN — problem captured, **design TBD**. On
> `feature/feature-kickoff`. Next step: map ideas with the user, then decide the
> approach. Nothing built yet. Scope covers BOTH ends of a feature's life:
> starting one and finishing one.

## Problem

The two ends of a feature's life are a manual ritual the user has to re-describe
every time, and the agent forgets steps if they aren't restated.

**1. Kickoff — starting the next feature.** Today: the user asks an agent to
"start a new feature" and must spell out each step — open a `feature/<name>`
branch off main, add the plan file + a `plan.md` dashboard entry, write
`understanding.md`, then begin the playback → build → verify cycle.

**2. Closeout — finishing a feature once it's done.** Once a feature is built,
deployed, and confirmed, "finishing it off according to our flow" is itself a
multi-step ritual: disarm the rollback, the keep-it bookkeeping (mark the plan
deployed & confirmed, move it to *Recently shipped*), retire `understanding.md`,
merge to main + push (fetch/compose first), and tidy up the branch. Same issue:
re-described each time, steps get dropped.

The user wants a **seamless experience for both** — kick off the next feature
and close out the finished one — without restating the whole dance and without
the agent forgetting pieces.

## Goal

_TBD — to be mapped with the user (for both kickoff and closeout)._

## Ideas / open questions

_To fill in as we map this out together (no solution chosen yet)._

## Design

_TBD._
