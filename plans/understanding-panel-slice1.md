# Understanding panel — slice 1: the panel itself (shipped)

> **Status (2026-06-13):** Shipped — merged to `main`, browser-verified 9/9.
> Detail for [understanding-panel.md](understanding-panel.md) slice 1; kept for
> the design record. Structured per [doc-principles.md](doc-principles.md).

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
| Source file | `plan.md` (the design in flight) | repo-root `understanding.md` |
| Lifecycle | spans the whole feature | refreshed each request / turn |
| Placement | its own nav tab | inline, top of the chat window |
| Audience signal | re-anchor mid-build | confirm before build starts |

They are complementary: the Plan tab is the durable design; the Understanding
panel is the pre-flight "did you hear me right". This slice **reuses** the Plan
tab's machinery (file-read endpoint, `Markdown` component, poll-while-visible)
rather than inventing new rendering. It does **not** touch `plan.md` or the
Plan tab.

## Design

A collapsible **Understanding panel** anchored at the top of the chat scroll
view (above the message list, below `chat__bar`), rendering an understanding
file Claude maintains. Reuses existing infrastructure end to end.

### Getting Claude to write the file (prompt-driven, no extra call)

The panel is worthless if Claude doesn't produce the file, but the **expensive
path is off the table**: having `CliRunnerService` generate the understanding
would mean a **separate `claude -p` invocation per turn**, and that cost is not
worth it. So the instruction is **prompt-driven** and rides the *normal* turn —
no second model call: a line in `CLAUDE.md` tells Claude "write your
understanding of this request to `understanding.md`", and Claude writes it with
a normal `Write` inside the turn it's already running. Zero Harness code, zero
extra tokens.

> This is exactly the limitation slice 2 picks up: the convention only fires
> where that `CLAUDE.md` line exists — i.e. the Harness, not Product Repos. See
> [understanding-panel.md](understanding-panel.md) slice 2.

The file is written **once at the start of the turn**; if Claude rewrites it
later, the panel's poll picks that up for free — no special live-sync.

### Backend

**None.** The understanding file is a **repo-root `understanding.md`**, so the
panel reads it through the existing
`GET /api/files/read?path=understanding.md` (FileService path validation
applies; 404 → hidden/empty panel), exactly as the Plan tab reads `plan.md`.
No controller, no service, no new store.

### Frontend

- `components/chat/UnderstandingPanel.jsx` + CSS — collapsible card pinned at
  the top of `chat__scroll` in `pages/Chat.jsx`. Fetches the understanding file
  on mount, on `currentRepoId` change, on `visibilitychange`, and polls every
  ~5 s while visible so it updates live as Claude writes it — the
  `pages/Plan.jsx` pattern, lifted, not re-invented. Renders via the shared
  `Markdown` component. Empty/404 → panel hidden (no noise when there's nothing
  to confirm). Collapsed state remembered device-locally.
- Gated by capability `understandingPanel: 'advanced'` in
  `context/UiModeContext.jsx` — **new UI features default to Advanced** per
  CLAUDE.md.
- i18n strings in `en.json` / `tr.json` (title, collapse/expand).

## Decisions

- **Reuse the Plan tab's render+poll machinery**, don't fork it (doc-principles
  §3: extract/share, don't paste).
- **Inline panel, not a new nav tab** — its job (confirm before proceeding)
  belongs next to the chat.
- **Advanced-mode default** per the new-feature convention.
- **Markdown render** via the shared `Markdown` component (mermaid included).
- **File location:** repo-root `understanding.md` (no backend; mirrors `plan.md`).
- **How Claude is instructed:** prompt-driven, no separate `claude -p` call.
- **Refresh:** write-once at the start of the turn; the panel's poll catches
  later rewrites.
- **Mode:** Advanced only — not exposed to the End User (Basic).

## Verification (done — 9/9)

`verify-understanding-panel.mjs` on an isolated `:5200` preview, per
`docs/claude-web/browser-testing.md` (headless Playwright, cookie auth):
panel renders `understanding.md` as markdown atop chat; collapse/expand works
and persists across reload; hidden in Basic mode; hidden when no file. Visually
confirmed via screenshot.
