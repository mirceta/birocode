# Understanding — Agentic Engineering Lab

## What you asked for

A **hub / home for your own development of learning about agentic engineering
principles** — a living, personal knowledge base inside the Claude Web repo
that holds:

- **What I've learned** — settled lessons.
- **What I've found** — observations/discoveries not yet generalized.
- **What I'm currently testing** — patterns & principles in flight.
- **What's turned out bad** — anti-patterns, things that didn't work.
- **What's turned out good** — ideas worth keeping.
- **How I'll test** patterns & principles I'm using — a testing methodology.
- A **repository of the patterns & principles** themselves.

You also asked for my feedback on whether this should be a **new local app** or
folded into the existing **homepage** local app.

## My recommendation (and the decision I'm proceeding on)

**A new local app**, not a homepage topic — because:

1. **Different audience/purpose.** `homepage/` is onboarding doctrine *for
   agents*; this is *your* evolving lab notebook + pattern library.
2. **Different data model & cadence.** This wants structured, growing,
   append-heavy records (entries by status + a pattern repository), not static
   topic prose.
3. **The platform already supports it** — multiple local apps per repo
   (`/api/localview/{repo}/app/{appId}/`); the Understanding app proves the
   build-less pattern.
4. **Independent lifecycle** — a journal grows forever; homepage topics freeze.

I asked you to confirm two forks (surface, storage); the question prompt was
dismissed, so I'm proceeding on the **recommended defaults** and will adjust if
you say otherwise:

- **Surface:** new build-less local app at `lab/` (entry `lab/index.html`,
  relative URLs only), served the way `homepage/` is.
- **Storage (MVP):** **agent-curated static data** — entries & patterns as
  JSON/Markdown files in the repo that I add/edit on request (full git history,
  zero backend). A live backend-CRUD slice (edit from the browser, like Ideas)
  is a possible later slice.

## What I'll do (this kickoff)

- [x] Confirm on `main` synced with `origin/main`, branch off → `feature/agentic-lab`.
- [x] Add an **Active feature plans** entry in `plan.md`.
- [x] Write this `understanding.md`.
- [x] Write the detail plan `plans/agentic-lab.md` (sections, data shape, how
      it's registered as a local app, MVP vs follow-up slices).
- [x] Build the build-less SPA under `lab/` + its seed data (7 sections:
      Learned / Found / Testing / Good / Bad + How-I-test + Repository).
- [x] Register it as a local app (`lab`, synthetic `kind:harness`, **self repo
      only**); browser-verified on an isolated `:5251` preview; rebuilt +
      restarted live `:5099`. **Awaiting your in-browser confirmation.**

## Assumptions

- New local app + agent-curated static MVP (per above) until you say otherwise.
- App folder name `lab/`, appId `lab`, title "Agentic Engineering Lab" — easy to
  rename; tell me if you'd prefer another.
- One-feature-per-branch holds: this is its own feature on its own branch.
