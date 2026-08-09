# Proposal: expand-popup-prompt-list

> **Amended 2026-08-09:** the list's source is the QUEUE STASH (the cached prompts on the
> composer strip — the same items an armed queue loop unloads), NOT the custom-prompts
> library. The first cut wired the popup to `/api/prompts`; the user corrected it: "saved
> prompts" meant the cached/queued ones. The custom library stays ⚙-only.

## Why

The composer's expand popup (openspec add-prompt-expand-popup) is where long prompts get
written — especially inside a dashboard dock, where the inline textarea is a sliver. But the
composer's cached prompts — the stash chips above the input row, the very items a queue loop
drains in order — are invisible from inside the popup: while drafting in the big editor you
cannot see what is already queued, reuse a cached prompt's text, or queue what you just
drafted without closing the editor first.

## What Changes

- The expand popup lists the surface's queued/cached prompts (the same stash the composer
  strip shows and an armed 🗒️ queue loop unloads: the dock's own tab when embedded, else
  the active tab's stash, else the main chat's global queue) below the draft editor. Entries
  are numbered in strip order — the order an armed queue loop sends them — and each has an
  Insert action that APPENDS the prompt's text to the draft (blank-line separated, same
  contract as the strip's chips feeding the composer). Insert copies; it does NOT consume
  the queue item. Nothing auto-sends; the popup stays open so drafting continues.
- The popup gains a minimal add-to-queue form (required text) that appends a new item to the
  same stash — it immediately appears in this list and as a chip on the composer strip, and
  an armed queue loop will drain it like any other queued prompt.
- Scope cuts (deliberate): remove/reorder/send of queued prompts stay on the composer strip
  (its chips already do all three); the custom-prompts library and fixed catalog stay behind
  the ⚙ manager and are NOT listed here.
- The queued-prompts section is gated on the existing `promptStash` capability (the same
  gate as the strip and bookmark button), on top of the popup's own `promptExpand` gate. No
  backend change — the existing dock stash sync carries everything.

## Impact

- Capabilities: `chat` (MODIFIED: expand-popup requirement grows the queued-prompts section)
- Code: `client/src/components/chat/PromptExpandModal.jsx` (queue list + add form),
  `client/src/components/chat/ChatInput.jsx` (pass stash + addStash through),
  `client/src/components/chat/chat.css`, `client/src/i18n/en.json`, `client/src/i18n/tr.json`
