# Plan Tab — clickable subplan navigation

> **Status (2026-06-11):** Deployed and confirmed. Live on the :5099 harness,
> browser-verified (`.claudeweb-preview/playwright/verify-plan-tab-nav.mjs`,
> 10/10 checks) and confirmed by the End User.

## Problem

The original Plan tab (`plans/plan-tab.md`) renders one file — repo-root
`plan.md` — and any markdown links inside it open externally
(`target="_blank"`). On a phone that means leaving Claude Web to read a
subplan, which defeats the point of the tab.

## Goals

1. Markdown links to other plan files (e.g. `[detached-runs](plans/detached-runs.md)`)
   are clickable **inside** the Plan tab — clicking renders that subplan in
   place, without leaving the tab.
2. A small button at the top **always** returns to the root `plan.md`. The
   user can dive arbitrarily deep into subplans and one tap brings them home.

## Design

### What counts as an "internal" link

A link is intercepted when **all** of:
- no protocol (no `http://`, `https://`, `mailto:`, etc.)
- not anchor-only (`#section` keeps native in-page scroll)
- no modifier key held (Cmd/Ctrl/Shift/Alt → still opens new tab)

So `plans/foo.md`, `../README.md`, `docs/claude-web/proxy.md` are all
intercepted. `https://anthropic.com`, `#design`, and Ctrl-click on any link
are not.

### Path resolution

Relative hrefs are resolved against the **current file's directory**, not the
repo root. If currently viewing `plans/foo.md` and the link is `bar.md`, the
new path is `plans/bar.md`. Standard `..` traversal supported.

The backend's `FileService.ResolveSafePath` already rejects anything escaping
the repo root, so client-side resolution can be lenient — the server is the
guard.

### UI

A sticky header bar above the markdown:

- Left: a **⌂ plan.md** button. Always rendered. Disabled (dimmed) when
  already at root so the layout doesn't jump.
- Middle: the current path (e.g. `plans/detached-runs.md`) as a muted
  breadcrumb so you know where you are.

That's it — no full breadcrumb history, no forward/back stack. The home
button is the only navigation primitive. If the user needs to revisit a
subplan, they go home and click it again. Simpler is better on a phone.

### State

Plan tab adds local React state `currentPath` (default `'plan.md'`). The
existing fetch/poll loop keys off `currentPath` instead of the hardcoded
literal. Switching repos resets `currentPath` to `'plan.md'`.

No URL params, no browser history integration — this is in-tab navigation
only.

### Empty subplan

If a clicked subplan doesn't exist (404 from `/api/files/read`), the same
empty state shows, with the header bar still present so the user can go home.

## Implementation

1. **`client/src/components/shared/Markdown.jsx`** — added optional
   `onLinkClick(href, event)` prop. When provided AND the link is internal
   per the rules above, calls `event.preventDefault()` and invokes the
   handler. Otherwise behaves as today (`target="_blank"`). Other call sites
   (chat, file viewer) pass nothing → no behavior change.

2. **`client/src/pages/Plan.jsx`** — added `currentPath` state, keyed the
   fetch on it, rendered the header bar, passed an `onLinkClick` to
   `<Markdown>` that resolves the href and `setCurrentPath`s.

3. **`client/src/pages/plan.css`** — sticky header bar with disabled-state
   home button and monospace path label.

4. **i18n** — `plan.home` / `plan.homeAria` keys in `en.json` and `tr.json`.

5. **No backend changes.** `/api/files/read?path=...` already accepts any
   path inside the repo root.

## Verification

`.claudeweb-preview/playwright/verify-plan-tab-nav.mjs` — 10 checks against
the live :5099 harness, all pass:

- Root plan.md renders.
- Home button disabled at root; path label hidden.
- Internal link has no `target="_blank"`.
- Clicking the link swaps content; path label appears; home button enables.
- Clicking home returns to root; home button disabled again.
