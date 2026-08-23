# claude-in-chrome — design

## Context

Claude Code ≥ 2.x supports `--chrome`: the CLI connects to the Claude in Chrome
extension over a Chrome native-messaging host and exposes it in-session as the
`claude-in-chrome` MCP server. Verified on this host: CLI 2.1.235 lists `--chrome` /
`--no-chrome`, and the native host `com.anthropic.claude_code_browser_extension` is
registered under `HKCU\Software\Google\Chrome\NativeMessagingHosts` (extension
installed).

Harness facts the design leans on:

- Every chat turn is a fresh `claude -p [--resume <id>]` spawn
  (`CliRunnerService.CreateProcessInfo`).
- The builder lane passes `--dangerously-skip-permissions`, so MCP browser tools need
  no interactive approval; the ask lane runs `--permission-mode plan` and must never
  get the browser.
- `ANTHROPIC_API_KEY` is already stripped from the child env — subscription auth, which
  `--chrome` requires (API-key auth silently disables the integration).
- Per-(repo, lane) single-flight already exists (`RunSessionService.TryBeginRun`);
  the browser adds a *global* single-holder constraint on top (one native-messaging
  pipe per Chrome).

## Goals / Non-Goals

**Goals**
- Per-conversation opt-in browser mode from the chat UI (Advanced), builder lane only.
- Spawn contract: add `--chrome` when the turn has browser mode; nothing else changes.
- Global serialization: at most one browser-enabled turn at a time across all repos
  and lanes, with a clear, immediate rejection (no silent queueing).
- Honest status: an endpoint reporting whether the integration looks usable
  (native host registered, CLI flag supported) and whether the pipe is currently held.

**Non-Goals**
- No tab/window management from the harness (the API has none — window placement is
  the Operator dragging the tab group).
- No headless/CI browser path (that is Playwright's job, out of scope).
- No attempt to share one long-lived browser CLI session across turns; turns stay
  fresh `-p` spawns, `--resume` carries the conversation.

## Decisions

**D1 — The flag rides the ChatRequest, not server-side session state.**
`ChatRequest` gains `Browser` (bool). The client owns the toggle (device-local,
per-device like Simple/Advanced) and sends `browser: true` on each send while on.
Alternative — persisting a per-session flag server-side — rejected: the harness has no
per-conversation settings store, the client already threads `model`/`lane` the same
way, and a stateless flag can never go stale.

**D2 — Builder lane only, normalized server-side.**
`browser && lane == "ask"` is coerced to false in the controller (defense in depth; the
UI also hides the toggle in Ask view). Rationale: browser tools mutate the world; the
ask lane's contract is "structurally read-only".

**D3 — Global gate as a tiny singleton (`ChromeGateService`), acquired in the
controller, released in the run's `finally`.**
`TryAcquire(repoName)` / `Release()` around the detached run. Conflict → HTTP 409 with
a message naming the holder repo. Alternative — queueing browser turns — rejected: a
queued browser turn can wait minutes silently; an explicit "browser busy (repo X)"
lets the user decide. The gate is advisory-global inside this harness process; two
harnesses on one box could still collide, which the status endpoint can't prevent —
accepted risk, single-harness is the deployed reality.

**D4 — Status = cheap host-side signals only, no probe session.**
`GET /api/chrome/status` returns `{ available, hostRegistered, cliSupported, busy,
busyRepo }`. `hostRegistered`: HKCU/HKLM native-messaging key for
`com.anthropic.claude_code_browser_extension`. `cliSupported`: `claude --help`
contains `--chrome` (cached after first check). We deliberately do NOT spawn a probe
CLI session to test the pipe — it would hold the single-holder pipe just to report on
it. `available = hostRegistered && cliSupported`; the UI shows why when false.

**D5 — Fresh window per conversation is accepted, documented, not fought.**
Whether a resumed `-p` re-attaches to its session's previous tab group could not be
verified on this box without driving a real session (single pipe, live Chrome — an
Operator-visible side effect). The implementation is agnostic either way: nothing in
the harness references tabs or groups. The agent-facing doc tells the agent to address
pages by URL (never by remembered tabId) and tells the Operator that dragging the
Claude tab group into a preferred window is sanctioned and survives within a session.

**D6 — Agent-facing doc in `docs/claude-in-chrome.md`.**
The traps from the handoff (address-by-URL, tabId required in batches, single-holder
pipe, service-worker idle death, subscription-auth requirement, read-only vs
state-changing split) live in one agent-agnostic doc, following the repo's existing
convention-doc pattern. The chat UI links nothing; agents and operators read it off
disk.

## Risks / Trade-offs

- [Agent acts as the Operator in their logged-in browser] → opt-in per send, builder
  lane only, behind both auth gates; audit log already records every prompt with actor.
- [Login wall / CAPTCHA stalls a headless turn] → the turn streams tool activity to
  chat, so the stall is visible; Stop kills the CLI tree as with any turn. Documented
  in the doc as "have the host reachable when asking for gated sites".
- [Pipe collision with a non-harness `claude --chrome` session on the host] → status
  endpoint can't see it; error text from the CLI streams into chat. Accepted.
- [CLI auto-connects some future default] → we pass `--chrome` only when asked and
  never pass `--no-chrome` otherwise; if a future CLI defaults browser ON, add
  `--no-chrome` to the non-browser spawn (noted in doc).

## Migration Plan

Pure addition — no schema, store, or breaking API change. Deploy via `swap.ps1` as
usual; rollback via the standard dead-man switch. Frontend capability
`browserMode: 'advanced'` keeps Basic mode unchanged.

## Open Questions

- Resume ↔ tab-group reattachment (D5): to be answered empirically the first time the
  feature is used live with the Operator watching Chrome; the doc gets updated with
  the observed behavior. Nothing in the code depends on the answer.
