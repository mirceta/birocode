# Understanding panel — the agent's restatement of the request, atop chat

> **Status (2026-06-13):** Slice 1 **shipped** (panel merged to main,
> browser-verified 9/9). **In flight: slice 2** — make it work for Product
> Repos (problem specified below, solution not yet designed).
> Structured per [doc-principles.md](doc-principles.md).

A collapsible panel at the top of the chat window that renders Claude's own
restatement of the current request — read from a repo-root `understanding.md`
that Claude writes — so the user can confirm "you understood me" before work
proceeds.

## Slice 1 — the panel itself (shipped)

The panel, its repo-root `understanding.md` contract, the Plan-tab machinery it
reuses, and the prompt-driven write convention. Merged to main,
browser-verified 9/9. Full design record:
[understanding-panel-slice1.md](understanding-panel-slice1.md).

## Slice 2 — make it work for Product Repos (in flight)

> Status: **designed + built, pending browser-verify.** A composer-prefill
> button (below). Approach chosen by the user to avoid any extra `claude -p`
> cost.

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
  `CliRunnerService.CreateProcessInfo`
  (`ClaudeWeb.App/Services/Chat/CliRunnerService.cs`) spawns `claude -p <message>
  --output-format stream-json --include-partial-messages --verbose` (+
  `--resume`/`--model`) and **nothing else** — no `--append-system-prompt`, no
  injected instruction. The working dir is the *selected repo*
  (`CliRunnerService.cs:632`), so in a Product Repo the CLI reads *that* repo's
  `CLAUDE.md`, which has no such convention.

Net effect: the panel **renders** for any selected repo but is only ever
**populated** for the Harness's own repo. In a Product Repo `understanding.md`
is never written, so the panel stays hidden.

### Goal

The understanding panel should work for **Product Repos too**, not just the
Harness — when the user makes a substantive request in any opened Product,
Claude writes that Product's `understanding.md` and the panel shows it.

### Design (chosen) — a composer-prefill button

A button in the chat composer (`components/chat/ChatInput.jsx`, next to
attach/stash) that **drops the standing "write your understanding first"
instruction into the chat text box**. It does **not** auto-send — the user
reviews and presses Enter, so it's an ordinary chat turn. Because the turn runs
the CLI in the *selected repo's* working dir, the agent writes **that repo's**
`understanding.md`, which the panel already renders — so it now works in any
Product Repo. Accepted tradeoff: the user must remember to click it.

- Reuses the existing composer-prefill mechanism (`onChange`/`setDraft`, the
  same path the prompt-stash chips and the Exposure check's "Fix with an agent"
  use). **No backend change, no CLI change, no extra model call.**
- Non-destructive: appended to any existing draft (nothing lost), then the box
  is focused for review.
- Gated by the existing `understandingPanel: 'advanced'` capability; the canned
  text and button label are i18n'd (`understanding.prefillPrompt`,
  `understanding.prefill`).

### Why not the alternatives

- **`CliRunnerService` system-prompt append — rejected by the user.** It would
  ride a `claude -p` call that Anthropic is expected to tax heavily soon; the
  whole point here is to add **zero** extra invocation cost.
- **Seeding the convention into each Product's `CLAUDE.md` on onboarding** —
  only works after onboarding is run and can fight a user-managed `CLAUDE.md`.
  The button works immediately in any repo with no per-repo setup.

### Related nuance (not addressed here)

Whether the panel should follow the dual-chat scope (Project vs Claude Web
chat) rather than the global `currentRepoId` is left as-is; the button simply
fills the active composer, so it already targets whichever chat is in front.
