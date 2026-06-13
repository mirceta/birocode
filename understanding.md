# Understanding — Understanding panel

## Goal

Add a collapsible panel pinned at the **top of the chat window** that renders
Claude's own restatement of the current request, so you can confirm "you
understood me" before work proceeds.

## What I'm building

- A repo-root **`understanding.md`** (this file) that Claude writes — no
  backend, read through the existing `/api/files/read` like the Plan tab.
- **`UnderstandingPanel.jsx`** + CSS — collapsible card atop `chat__scroll`,
  polls while visible so it updates live, hidden when the file is absent.
- Capability **`understandingPanel: 'advanced'`** (Advanced mode only).
- A **`CLAUDE.md` convention** telling Claude to write this file first
  (prompt-driven — no extra `claude -p` call).
- i18n strings (en/tr).

## Assumptions

- File location is repo-root `understanding.md`, write-once per turn, Advanced
  only — per your answers to the plan's open questions.
- Verification is a headless Playwright check on an isolated `:5200` preview.
