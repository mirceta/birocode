# System tests for the Chat feature

> **Status:** Active — **suite built & run; 61/61 checks pass**. On
> `feature/chat-system-tests`. Branch off `main` 2026-06-19. The black-box suite
> lives in `tests/chat-systest/` and runs against an isolated instance
> (fresh `CLAUDEWEB_DATADIR`, own port, throwaway scratch repo) so real CLI turns
> never touch the live store. All 14 enumerated scenarios are covered; the Chat
> surface proved robust. Two low-severity semantic findings recorded below —
> fixes spin out per one-feature-per-branch.

## Goal

Find **every** behaviour of the Chat feature that can be exercised against the
running Harness, then run **all** of those as black-box **system tests** —
hitting the real HTTP/SSE surface (and, where it matters, the real Claude CLI) —
to surface bugs. The user has explicitly authorised spending tokens on real
runs; the point is bug-finding coverage, not frugality.

"System test" here = drive the app from the outside (HTTP + SSE + on-disk
session files) the way the frontend does, asserting on observable behaviour.
This is broader than the one existing Playwright UI test
(`.preview-test/chat-windowing-check.mjs`, which mocks the network).

## Run modes — headless + interactive (one definition)

Each scenario is wrapped in `step(name, fn)` (`lib.mjs`). A **step** is the unit
of a test, and the same script runs two ways via `SYSTEST_MODE`:

- **headless** (default) — steps run back-to-back, ending in a pass/fail summary.
  This is how an **agent** runs a suite by itself (`node behavioural.mjs`).
- **interactive** (`SYSTEST_MODE=interactive`) — the runner **blocks before each
  step** until the hub releases it (`go` / `skip` / `abort` on stdin), so a human
  **operator** clicks through one step at a time and sees per-step feedback.

Steps emit structured `@@SYSTEST@@` events (step start/end with status + checks +
an observed line, then a `summary`) **alongside** the existing `[PASS]`/`[FAIL]`
console lines, so headless consumers are unaffected. The hub's two run buttons
(**Run headless** / **Step through**) and its live step list are built on these
events. One definition, no second copy to drift. New tests get this for free by
using `step()` per scenario.

## Surface under test (discovered)

Backend (`ClaudeWeb.App/Controllers/ChatController.cs` + `Services/Chat/*`):

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/chat` | start/resume a turn; body `{message, sessionId?, model?, lane?}`; returns SSE |
| GET  | `/api/chat/stream?after=N&lane=` | reattach; replay events after seq N then live |
| POST | `/api/chat/stop?lane=` | cancel the running CLI process tree |
| GET  | `/api/runs` | per-repo run snapshot `{repoId: {status, sessionId, lastSeq}}` |
| GET  | `/api/sessions` | list prior sessions for selected repo (JSONL on disk) |
| GET  | `/api/sessions/{id}/messages` | human-visible transcript for one session |

Cross-cutting: `X-Repo-Id` header scopes every call; auth is an HttpOnly cookie
(`POST /api/auth/login`). SSE event shapes: `session, token, thinking, tool,
usage, done, error`, each carrying a monotonic per-repo `seq`. Lanes: `builder`
(single-flight per repo) and `ask` (read-only `--permission-mode plan`, runs
concurrently with builder, slot key `repoId#ask`).

## Test scenarios to cover

Behavioural (no/low token cost — protocol & error paths):
1. **Auth gate** — chat endpoints reject calls without the session cookie.
2. **Validation** — empty `message`, missing repo selection → 4xx, not 500.
3. **409 single-flight** — second `builder` POST while one is live → 409.
4. **Ask concurrency** — `lane=ask` succeeds while a `builder` run is live; two
   independent seq streams / sessions.
5. **Stop** — `/api/chat/stop` returns 200, `/api/runs` flips to terminal,
   process tree dies (no further billing).
6. **Reattach** — disconnect mid-stream, `GET /api/chat/stream?after=N` replays
   from seq N with **no duplicates and no gaps**; seq strictly increasing.
7. **Runs snapshot** — `/api/runs` reflects running → done/error transitions.
8. **Sessions list/transcript** — after a real turn, the session appears in
   `/api/sessions`; `/api/sessions/{id}/messages` returns the user+assistant
   text; path-traversal `id` rejected.
9. **Bad inputs** — unknown `lane`, unknown `model`, malformed `sessionId`,
   resume of a non-existent session → graceful error event, not a hang/500.

Real-run (token-spending — end-to-end through the CLI):
10. **Basic turn** — short prompt → ordered `session → token… → usage? → done`.
11. **Resume** — second turn with returned `sessionId` appends to same JSONL.
12. **Tool lifecycle** — a prompt that forces a Read → `tool` start/input/end
    with summary/preview/ok.
13. **Model param** — `model=claude-haiku-4-5` (cheap) is honoured by the CLI
    and reflected in the run record.
14. **Ask read-only** — an `ask`-lane prompt asking to write a file does **not**
    mutate disk (permission-mode plan holds).

## Approach (decided)

- Black-box **Node `.mjs` scripts** driving the Harness over HTTP/SSE — same
  transport the frontend uses; protocol tests use plain `fetch` + an SSE reader.
  Committed under **`tests/chat-systest/`** (NOT `.preview-test/`, which is
  gitignored — that dir holds local one-off probes, not committed assets).
- Run against a **self-dev isolated build** (never the live `:5099` store) per
  `docs/claude-web/self-dev.md`, with a throwaway repo registered as the target
  so real CLI turns don't touch anything that matters.
- Cheapest model (`claude-haiku-4-5`) for token-spending cases; keep prompts
  tiny ("reply with the word OK").
- One script per scenario group; a small shared helper for login + SSE parsing.
- Collect failures into a findings list; each confirmed bug gets a one-line repro.

## Out of scope (for now)

- Fixing the bugs found — this feature is **discovery**. Fixes spin out into
  their own branches per the one-feature-per-branch rule.
- Frontend rendering correctness beyond what the existing windowing test covers.

## Results (2026-06-19)

**61/61 checks pass** across four scripts. The Chat HTTP/SSE surface is robust:
auth-gated, validates input (4xx never 500), single-flight 409 holds, the ask
lane runs concurrently on its own slot/seq, stop kills the run, reattach replays
with no dupes/gaps and strictly-increasing seq, sessions/transcript read back,
and malformed real inputs (ghost session, bad model/lane/sessionId) all reach a
clean terminal `error` — no hangs, no 500s, no wedged slots.

- `behavioural.mjs` — 21/21 (scenarios 1-2, 5-9 protocol; no tokens)
- `smoke.mjs` — 4/4 (one cheap real turn)
- `realrun.mjs` — 30/30 (scenarios 3,4,5,6,10-14; tokens)
- `badinput.mjs` — 10/10 (scenario 9 real malformed inputs; tokens)

### Control hub (keeps the feature visible)

A small build-less web app at **`tests/chat-systest/hub/`** is the single place to
keep this suite understandable and under control — so it isn't forgotten. It
renders the scenario catalog + token cost per suite + the findings below, runs
any suite with a click and **streams PASS/FAIL live**, keeps a run history, and
can **orchestrate the isolated instance** (build → launch :5310 → register
scratch repo → teardown via `instance.mjs`). It's a *real product you run*,
exposed on the **Local tab** per `docs/local-exposure-convention.md` (dual-stack
bind, serves at `/`, relative URLs). Run: `node tests/chat-systest/hub/server.mjs`
→ `http://localhost:5320/`. No production C# touched; runtime state is gitignored
under `hub/.state/`. Wiring port 5320 onto the Local tab is the Operator's step.

### Test-infrastructure added

- **`CLAUDEWEB_DATADIR`** override (`AppPaths.DataDir`, all 16 data-dir sites) so
  an isolated instance keeps its own store — the only production change, additive
  and no-op when unset. Committed separately.

### Findings (low severity — candidate follow-up branches)

1. **A user-initiated stop is recorded as `status: "error"`** in `/api/runs`
   (`RunSession.Complete()` sets `done` only if a `done` event was seen, else
   `error`; a cancel sees none). So a deliberately-stopped run is
   indistinguishable from a crashed one, and the stop also emits
   `{type:"error",message:"Run stopped by user."}`. Repro: start a turn, `POST
   /api/chat/stop`, read `/api/runs` → `error`. Consider a distinct
   `stopped`/`cancelled` status.
2. **Resuming a non-existent session yields an opaque `error_during_execution`**
   (no `session` event, no "session not found" hint). Repro: `POST /api/chat`
   with a well-formed but unknown `sessionId` → terminal `error` with that
   generic message. Graceful (no hang/crash) but unfriendly.

## Open questions

- (resolved) Isolated-build target: **fresh `CLAUDEWEB_DATADIR` + throwaway
  scratch git repo, binaries run from outside the repo tree** so no self-repo is
  auto-pinned. The live store is never touched, so no backup/restore needed.
