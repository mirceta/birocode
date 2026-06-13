# Understanding — Understanding panel availability (problem spec)

## Goal

Verify a claim that will become the **problem specification** for the next
slice of `plans/understanding-panel.md`:

> The understanding panel is available in **our application** (the Harness /
> Claude Web itself) but **not** in any of the **product applications** (the
> apps inside other opened Repos).

## What I'll do

1. Investigate the code to determine, precisely, where the panel and its
   `understanding.md` actually work:
   - the panel **UI** (where it renders), and
   - the panel's **content trigger** — what makes Claude write `understanding.md`
     (the `CLAUDE.md` convention vs. any Harness-level prompt injection).
2. Confirm whether product Repos ever get an `understanding.md` written, i.e.
   whether the panel is ever populated outside the Harness's own repo.
3. Write up the verified finding as the **Problem** section of a new slice in
   the plan. (Not solving it yet — just specifying it.)

## Finding — CONFIRMED (2026-06-13)

Hypothesis confirmed against `main`:

- Panel UI is Harness-only by construction (`UnderstandingPanel.jsx` in the
  Harness chat; Products are separate iframe apps).
- The write trigger is **only** the Harness's `CLAUDE.md` convention. The CLI
  spawn (`CliRunnerService.cs:597-636`) injects **no** system prompt, and runs
  in the *selected repo's* dir — so a Product Repo reads its own `CLAUDE.md`,
  which lacks the convention. `understanding.md` is never written there → panel
  stays hidden.

Net: the panel **renders** for any repo but is only ever **populated** for the
Harness. Recorded as the **Slice 2 problem spec** in
`plans/understanding-panel.md`; solution design is the next step (not done yet).
