# Understanding — interactive + headless system tests

## Goal
A system test should run in **two modes from one definition**:

- **Headless** — runs end-to-end with no human, emits a pass/fail summary. This is
  how an **agent** runs the suite by itself (today's behaviour).
- **Interactive** — a human **Operator** clicks through the test **one step at a
  time**, and the Harness shows **visual feedback per step**: what the step did,
  what was expected, and whether it passed, failed, or behaved unexpectedly.

Same test, same assertions — the only difference is whether a human is driving and
watching, or it just runs.

## The core problem
Today a test (`tests/chat-systest/*.mjs`) is an opaque Node script that prints
`[PASS]`/`[FAIL]` lines; the hub greps those lines into a console log. There is **no
notion of a step**, so there is nothing to click through and nothing to show per
step. The whole point of this work is to introduce a **step** as the unit of a test.

## Approach (single source of truth)
Keep tests as ordinary imperative `.mjs` scripts — do **not** split into a separate
"interactive" copy (they would drift). Add a `step()` boundary to `lib.mjs`:

- `await step('name', async () => { ... })` wraps a logical scenario. Inside, the
  existing `check()` calls record results as they do now.
- Each step emits **structured events** (start / end with status + the checks it
  made + a short "observed" line), in addition to the human-readable console lines.
- A `SYSTEST_MODE` env flag selects behaviour:
  - **headless** — steps run back-to-back (unchanged feel).
  - **interactive** — before each step the runner **blocks** until the hub sends a
    "go" signal, so the Operator advances the test by clicking.

## What I'll build
1. **Step protocol in `lib.mjs`** — `step()`, structured step events, and the
   interactive pause (wait for a go-ahead between steps via the child's stdin).
2. **Hub server (`hub/server.mjs`)** — `mode=headless|interactive` on the run
   endpoint; an interactive run keeps the child alive and exposes a "next step"
   control that releases the next step; parse the new step events.
3. **Hub SPA (`hub/public/`)** — each suite gets **Run (headless)** and **Step
   through** actions; interactive mode renders a **step list** that lights up
   pending → running → pass/fail with the observed detail and the checks per step,
   plus **Next step** / **Run the rest** controls.
4. **Refactor the existing suites** to express their scenarios as `step()`s so they
   become steppable (behaviour and assertions unchanged).
5. **Update the convention docs** (`tests/chat-systest/README.md`,
   `plans/chat-system-tests.md`, and the request-prompt generator) so newly
   authored tests use `step()` and are interactive-ready by default.

## Assumptions
- Interactive mode lives in the existing system-test **hub** (the vanilla SPA on
  the Local tab) — that's where these tests already live and run.
- "Headless" for an agent = running the `.mjs` directly (or the hub's headless
  endpoint); no UI required.
- Operator advances **each** step manually in interactive mode, with an escape
  hatch to run all remaining steps at once.

## Open question (branch)
This builds on the **chat-systest** infrastructure, which is not on `main` yet.
So this feature can't branch cleanly off `main` (our usual rule) — it needs to sit
on the chat-systest line. Flagging before I create the branch.

## Not doing (unless you say so)
- No declarative/JSON step DSL — steps stay as imperative JS so arbitrary
  assertions remain expressible.
- No change to the C# Harness production code; this is all test-harness tooling.
