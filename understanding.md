# Understanding — a side "Ask" conversation per repo

## The problem you described

When you just want to **ask something about a repository**, there's nowhere
good to do it:

- Each repo's agent is a **builder** — it's designed to be the *only* agent in
  that repo while it works. The backend enforces this: one running turn per repo
  (`RunSessionService.TryBeginRun(repoId)` → a second send gets a 409 "already
  in progress").
- So **while the builder is building, you can't ask it anything** — it's busy.
- And even when it's idle, **asking in the builder's chat pollutes its context**
  with your side questions, which you don't want.

You end up confused about *where* to ask a quick question about the repo.

## What you want

A **side conversation** ("Ask") attached to a repository that:
- is **always open / always available** — a known, fixed place to ask,
- works **even while the builder is running** (not blocked by the one-run rule),
- has its **own separate context** so it never pollutes the builder's session.

## What I'll do (this kickoff)

Set up the feature — branch, plan, and this understanding — and pin down the
design before building. The key facts that shape it:

- Sessions are already **separate JSONL files per conversation**, so an Ask
  conversation having its own context is natural — no cross-contamination.
- The blocker is the **per-repo single-run lock**. To let you ask while the
  builder runs, the backend must allow a *second concurrent run* on the same
  repo — but on a separate "Ask lane" with its own session.

## The main decision I need from you

Two `claude` processes in the **same working directory** at once is safe only if
the Ask one **doesn't edit files**. So I'm proposing the Ask lane runs
**read-only** (it can read/search/answer, but not Write/Edit/run mutating
commands) — which also matches "I just want to *ask* something." I'll confirm
this with you before building (see the plan). If you'd rather the Ask agent be
fully capable, that's possible but riskier and needs more care.

## Assumptions

- "Ask" is per-repo and persistent, surfaced as its own chat (likely a third
  option alongside the existing Project / Claude Web chats, or a dedicated dock).
- Desktop + phone both get it; it follows the active project like the Project
  chat does.
- This is a real backend change (loosen the run lock to per-(repo, lane)), not
  just UI — so it'll be sliced and browser-verified per our flow.
