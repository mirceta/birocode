# Understanding panel — the agent's restatement of the request, atop chat

> **Status (2026-06-13):** **Slice 1 shipped** — panel merged to main,
> browser-verified 9/9. Open questions resolved: file = repo-root
> `understanding.md` (**no backend**); write is **prompt-driven, no extra
> `claude -p` call**; **write-once** per turn (panel polling catches rewrites);
> **Advanced-mode only**.
> **Slice 2 — problem specified, not yet designed:** the panel works in the
> Harness but never in Product Repos (see "Slice 2" below).
> Structured per [doc-principles.md](doc-principles.md).

## Problem

Before Claude runs off and builds the wrong thing, the user wants a fast way
to confirm Claude understood the request. The ask: a **panel at the top of the
chat window** that shows Claude's own **understanding of what was requested**.
Claude writes that understanding to a **file**; the panel renders it in a
**pretty (markdown) view**. The user reads it, sees "yes, that's what I meant"
(or "no — fix this"), and only then lets the work proceed.

## Relationship to the Plan tab (convention check)

`plans/plan-tab.md` already renders a repo-root markdown file that Claude keeps
updated live (`plan.md`), via polling + the shared `Markdown` component. This
panel is close enough that we must be explicit about the difference, or we risk
building a near-duplicate:

| | Plan tab | Understanding panel |
|---|---|---|
| Answers | "What are we building / what's next" | "Did Claude understand *this request*" |
| Source file | `plan.md` (the design in flight) | a separate understanding file (see Q1) |
| Lifecycle | spans the whole feature | refreshed each request / turn |
| Placement | its own nav tab | inline, top of the chat window |
| Audience signal | re-anchor mid-build | confirm before build starts |

They are complementary: the Plan tab is the durable design; the Understanding
panel is the pre-flight "did you hear me right". This plan **reuses** the Plan
tab's machinery (file-read endpoint, `Markdown` component, poll-while-visible)
rather than inventing new rendering. It does **not** touch `plan.md` or the
Plan tab.

## Design

A collapsible **Understanding panel** anchored at the top of the chat scroll
view (above the message list, below `chat__bar`), rendering an understanding
file Claude maintains. Reuses existing infrastructure end to end.

### Getting Claude to write the file (resolved — prompt-driven, no extra call)

The panel is worthless if Claude doesn't produce the file, but the **expensive
path is off the table**: having `CliRunnerService` generate the understanding
would mean a **separate `claude -p` invocation per turn**, and that cost is not
worth it. So the instruction is **prompt-driven** and rides the *normal* turn —
no second model call:

- **First slice — pure prompt/convention.** The user (or a line in `CLAUDE.md`)
  tells Claude "write your understanding of this request to `understanding.md`".
  Claude writes it with a normal `Write` inside the turn it's already running.
  Zero Harness code, zero extra tokens.
- **Cheap later upgrade (optional).** `CliRunnerService` *appends one standing
  line* to the existing turn's prompt so the user needn't repeat it. This is
  still the same single call — the rejected thing was a **separate** `claude -p`
  generation, not appending text to the prompt already being sent.

The file is written **once at the start of the turn** (Q3); if Claude rewrites
it later, the panel's poll picks that up for free — no special live-sync.

### Backend

**None.** The understanding file is a **repo-root `understanding.md`** (Q1), so
the panel reads it through the existing
`GET /api/files/read?path=understanding.md` (FileService path validation
applies; 404 → hidden/empty panel), exactly as the Plan tab reads `plan.md`.
No controller, no service, no new store.

### Frontend

- `components/chat/UnderstandingPanel.jsx` + CSS — collapsible card pinned at
  the top of `chat__scroll` (or just above it) in `pages/Chat.jsx`. Fetches the
  understanding file on mount, on `currentRepoId`/session change, on
  `visibilitychange`, and polls every ~5 s while visible so it updates live as
  Claude writes it — the `pages/Plan.jsx` pattern, lifted, not re-invented.
  Renders via the shared `Markdown` component. Empty/404 → panel hidden (no
  noise when there's nothing to confirm). Collapsed state remembered
  device-locally.
- Gated by a new capability `understandingPanel: 'advanced'` in
  `context/UiModeContext.jsx` — **new UI features default to Advanced** per
  CLAUDE.md; trivially promotable to Basic if the End User should see it.
- i18n strings in `en.json` / `tr.json` (title, collapse/expand, empty hint).

## Decisions (my calls — flag if you disagree)

- **Reuse the Plan tab's render+poll machinery**, don't fork it (doc-principles
  §3: extract/share, don't paste).
- **Inline panel, not a new nav tab** — the user said "panel on top of the chat
  window", and its job (confirm before proceeding) belongs next to the chat.
- **Advanced-mode default** per the new-feature convention.
- **Markdown render** via the shared `Markdown` component (mermaid included).

## Resolved (was: open questions)

1. **File location:** repo-root **`understanding.md`**. No backend; mirrors the
   Plan tab's `plan.md`. (Per-repo, visible in the file tree/git — accepted.)
2. **How Claude is instructed:** **prompt-driven, no separate `claude -p`
   call.** A standing `CliRunnerService` generation was rejected as too
   expensive. First slice is pure prompt/convention; appending one line to the
   existing turn's prompt is a cheap optional upgrade (same call). See Design.
3. **Refresh:** **write-once** at the start of the turn; the panel's poll picks
   up any later rewrite. No special live-sync mechanism.
4. **Mode:** **Advanced only.** Not exposed to the End User (Basic).

## Verification (planned)

`verify-understanding-panel.mjs` on an isolated `:5200` preview, per
`docs/claude-web/browser-testing.md` (headless Playwright, auth via
`POST /api/auth/login` + cookie, not localStorage):

- with an understanding file present → panel renders it as markdown at the top
  of chat; collapse/expand works and the collapsed state persists across reload;
- file updated on the backend → panel reflects the new text within the poll
  interval (live update);
- no file → panel is hidden (no empty noise);
- panel hidden in Basic mode (capability gate).

Hygiene: the test writes/removes `understanding.md` under a pinned test repo
and restores it in `finally`; session logged out.

## Slice 2 — make it work for Product Repos (problem spec)

> Status: **problem specified, not yet designed.** This section is the agreed
> statement of what slice 2 will solve; the solution is deliberately left open.

### Problem

The panel works in the **Harness** (Claude Web's own repo) but is effectively
**unavailable in every Product Repo**. Verified against `main` (2026-06-13):

- **The panel UI is Harness-only by construction.** `UnderstandingPanel` lives
  in the Harness frontend (`client/src/components/chat/UnderstandingPanel.jsx`),
  rendered inside the Claude Web chat (`pages/Chat.jsx`). A Product is a
  separate app embedded via the App-tab iframe; the panel is never part of it.
- **The write trigger only fires in the Harness repo.** What makes Claude write
  `understanding.md` is the "write your understanding first" convention in
  `CLAUDE.md`, which the Claude CLI auto-loads from its **working directory**.
  `CliRunnerService.CreateProcessInfo` (`ClaudeWeb.App/Services/Chat/CliRunnerService.cs`)
  spawns `claude -p <message> --output-format stream-json --include-partial-messages
  --verbose` (+ `--resume`/`--model`) and **nothing else** — no
  `--append-system-prompt`, no injected instruction. The working dir is the
  *selected repo* (`CliRunnerService.cs:632`), so in a Product Repo the CLI reads
  *that* repo's `CLAUDE.md`, which has no such convention.

Net effect: the panel **renders** for any selected repo but is only ever
**populated** for the Harness's own repo. In a Product Repo `understanding.md`
is never written, so the panel stays hidden. This is the Q2 gap the slice-1
Design already flagged ("it only works where the convention exists").

### Goal

The understanding panel should work for **Product Repos too**, not just the
Harness — i.e. when the user makes a substantive request in any opened Product,
Claude writes that Product's `understanding.md` and the panel shows it.

### Out of scope / open for the design step

- The *how* is undecided. The slice-1 Design noted a candidate (the deferred
  Q2 upgrade: `CliRunnerService` appends the standing instruction to the turn's
  prompt — same call, no extra `claude -p`); another is seeding the convention
  into a Product's `CLAUDE.md` during product onboarding
  ([product-onboarding.md](product-onboarding.md)). Choosing and designing this
  is the next step, not part of this problem statement.
- Whether the panel should respect the dual-chat scope (Project vs Claude Web
  chat) rather than the global `currentRepoId` is a **related** nuance to settle
  during design, but it is not the core gap.
