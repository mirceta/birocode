# Design — prompt-expand popup

## Context

`ChatInput.jsx` is a controlled component: the draft text is `value` and edits flow up via
`onChange` into `ChatContext`, so the draft persists across tab navigation and can be appended
to by other tabs (Prompts modal, queued chips). The composer already portals a modal to
`<body>` (`PromptManager`) and gates optional toolbar buttons on UiMode capabilities
(`customPrompts`, `promptStash`). The expand feature follows those exact patterns.

## Goals

- Read and edit a long draft in a big window, then return to the composer with the edit kept.
- Single source of truth for the draft — no copy/merge, no risk of the popup and composer
  diverging.
- Reuse the established modal + capability + i18n patterns; no backend involvement.

## Decisions

### Bind the popup to the existing draft, not a local copy

The popup's `textarea` is bound to the **same** `value`/`onChange` the composer uses. Typing
in either updates `ChatContext`; closing the popup is a pure unmount. This avoids a
copy-on-open / write-back-on-close dance and the bug where the composer's auto-grow effect or
a queued-chip append races a stale local copy. It also means an in-flight stream that appends
to the draft (queued prompts) stays consistent in both views.

Rejected: a local `useState` copy synced on open/close — simpler to reason about in isolation
but reintroduces a merge point and can silently drop concurrent edits to the shared draft.

### Portal to `<body>`, like `PromptManager`

The popup is rendered through a portal so the small dashboard-dock window does not clip or
shrink it (the same reason `PromptManager` portals — see the dock-prompts-button note). It
covers the viewport with a backdrop and centers a large editor card.

### Closing semantics

Close via an explicit Done/close button, backdrop click, or Esc. All three just unmount; the
draft is already in `ChatContext`. The popup has **no** Send button — sending stays the
composer's job so the close→review→send flow matches every other prompt entry path (nothing
auto-sends). This keeps the "nothing is ever lost, nothing ever auto-sends" invariant the
composer documents.

### Capability + default mode

Register a `promptExpand` capability in `UiModeContext.jsx`, default **Advanced** per the repo
convention for new UI features. The button renders only when the capability is enabled, same
as `customPrompts`/`promptStash`. Available on both the main composer and dashboard docks
(no `embedded` gating needed — it only edits the local draft).

## Risks / Open questions

- **Mobile keyboard height** — the popup must stay usable with the on-screen keyboard up;
  size the editor with viewport-relative units and let it scroll rather than assuming full
  height. Verify on a phone-width viewport during implementation.
- **Focus management** — focus the popup `textarea` on open and restore focus to the composer
  on close, mirroring `insertPrompt`'s `requestAnimationFrame` focus handling.
