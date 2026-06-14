# Feature kickoff & closeout — a seamless feature lifecycle

> **Status (2026-06-14):** Kickoff button BUILT & browser-verified
> (`verify-feature-kickoff.mjs` 6/6: advanced-gated composer button prefills the
> ritual, no auto-send, hidden in Basic). Frontend-only, live on :5099. On
> `feature/feature-kickoff`, pending deploy/merge. **Closeout button still TODO**
> — awaiting the user's closeout prompt text. Defaults chosen: client-side prompt
> constant (i18n `feature.kickoffPrompt`), button in the composer toolbar next to
> the understanding-prefill button, advanced-gated (`featureKickoff`).

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

One-tap **composer-prefill buttons** that drop a ready-made prompt into the chat
box — one to **kick off** a feature, one to **close one out** — so the user
doesn't retype the ritual and the agent gets the full step list every time.

## Design (decided)

Reuse the exact mechanism the Understanding panel (slice 2) and the Exposure
check's "Fix with an agent" already use: a button calls
`ChatContext.prefillProjectChat(text)` (`client/src/context/ChatContext.jsx`),
which sets the project-chat draft to `text` and switches to the project chat —
**no extra model call**; the user reviews/edits, then sends. (See
`ExposeCheck.jsx`'s `fixWithAgent()` for the pattern: `prefillProjectChat(...)`
then `navigate('/studio')`.)

Two buttons, placed by the chat composer (left side, alongside the existing
prefill/attach controls — the spot the user pointed at):

- **Kick off a feature** → prefills a prompt instructing the agent to run the
  kickoff ritual: branch `feature/<name>` off main, create `plans/<name>.md` +
  a `plan.md` Active entry, write `understanding.md`, then play back before
  building. The user fills in the feature name/description and sends.
- **Close out the feature** → prefills a prompt for the closeout ritual: disarm
  the rollback, keep-it bookkeeping (mark the plan shipped → *Recently shipped*),
  retire `understanding.md`, `git fetch` + merge to main + push, tidy the branch.

The canned prompt text **is** the ritual's single source of truth (so the agent
stops forgetting steps) — mirrors how `ExposeService.BuildFixPrompt` keeps the
contract in one place.

### Kickoff prompt (exact text, user-supplied)

The button prefills this verbatim, leaving the trailing colon so the user types
the feature description after it, then sends:

```
I want you to start a new feature. make sure you are on the main branch that is synced with origin/main. create a new feature branch. Make a new entry in the Active feature plans section in plans.md . This is the feature we will be working on: 
```

### Closeout prompt (exact text)

_TBD — to be supplied by the user (same shape: the verbatim closeout ritual)._

## Open questions (decide at build time)

- **Prompt source:** a client-side constant, or server-built (like
  `ExposeService.BuildFixPrompt`) so the ritual lives in one canonical place?
- **Button placement/affordance:** exact spot + icon by the composer; one combined
  control vs. two buttons.
- **Gating:** Advanced-only (new-UI convention) vs. always shown.
- **Closeout smarts:** static prompt vs. lightly tailored to the current branch
  state (branch name, deployed/confirmed status).
