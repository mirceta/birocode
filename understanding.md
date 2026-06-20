# Understanding — narrate what the system tests are doing

## Goal
Right now a chat system-test run prints only terse `[PASS]/[FAIL]` lines plus a
summary — there's no plain-language account of *what the test is actually doing*
or *why*. As a first step toward better feedback, make a single test run tell
its story in the console (which the hub's console pane mirrors verbatim).

## What I'll do
- Add a `say(msg)` narrator helper to `tests/chat-systest/lib.mjs` — a distinct
  `→ ...` line, commentary only (never affects pass/fail). It prints to stdout,
  so it shows in the raw console AND the hub's console pane.
- Narrate the shared actions so every suite benefits for free:
  - `login()` — "logging in… / session established".
  - `startTurn()` — which lane / model / message / resume it's sending.
- Narrate each scenario: a one-line intent before the checks ("a logged-out
  client must be refused on every chat endpoint", etc.) across
  `behavioural.mjs`, `smoke.mjs`, `realrun.mjs`, `badinput.mjs`.

## Assumptions
- "For starters" = console narration now; richer per-step display in the
  interactive hub UI can follow later. Narration via plain stdout already
  reaches the hub console pane, so no server/SPA change is needed yet.
- Narration is descriptive only — it must not change any assertion or the
  PASS/FAIL/summary contract that the hub parses.
