# Design — kanban-agent-tabs

## Context

kanban-worker-window (archived 2026-09-16) shipped ONE shared named window
(`birocode-worker`) that every chip click renavigates. The Operator's follow-up:
each repo agent should own its OWN tab, and clicking the agent on a card should
just switch Chrome to that tab, wherever it is. Same deep link
(`/studio?agent=<repoId>`), same peer-registry URL derivation
(`agentWorkerHref`) — only the window-targeting layer changes.

## Research: how Chrome finds and focuses a named tab (engine-verified)

`.claudeweb-preview/playwright/check-agent-tabs.mjs` (playwright-core against
installed Edge, same rig as check-worker-window.mjs; `.claudeweb-preview/` is
gitignored so the script is force-added). 6/6 PASS:

1. Clicking agent A then agent B yields two distinct tabs (distinct names never
   collide).
2. Re-clicking A does NOT open a third tab.
3. Re-clicking A does NOT reload it — a marker planted in the tab
   (`window.__marker`) survives the click, because the lookup is
   `window.open('', name)` with an EMPTY url: Chrome returns the existing named
   context without navigating it.
4. Re-clicking A focuses it: `visibility=visible` and `document.hasFocus()=true`
   measured in A after the click (positive focus signals; headless Chromium
   doesn't model background-tab occlusion, so "the other tab went hidden" is
   logged informationally, not asserted).
5. Clicking B switches focus to B.
6. A tab living in ANOTHER OS window (popup stand-in for a dragged-out tab) is
   found by name, focused in that window, not duplicated, not reloaded.

The one subtlety: `window.open('', name)` on a NOT-yet-existing name creates a
tab at `about:blank`. So the handler navigates only in that case:

```js
const w = window.open('', name);
try { if (w.location.href === 'about:blank') w.location.href = url; }
catch { /* cross-origin existing tab (another machine's harness) — just focus */ }
w.focus();
```

The catch arm matters in the fleet: an existing tab pointed at a PEER harness
is cross-origin, so reading `location.href` throws — exactly the "tab already
exists" case, where we want focus-only anyway.

## Decisions

- **Per-agent name = `birocode-agent-<sanitized assignee key>`** — the same
  `sourceId|repoId` key the board already uses for identity/colours, characters
  outside `[\w.-]` mapped to `_` (window names travel into `target=` contexts;
  keep them boring). Stable across clicks, distinct across agents; empty key →
  `null` → chip not clickable (same null-safety ladder as `agentWorkerHref`).
- **The chip IS the button.** The old design bolted a ⧉ button beside the
  label; now the whole chip gets `role=button` + click (stopPropagation so the
  card's own click-to-open survives), with ⧉ kept as a passive `aria-hidden`
  cue. Fewer targets, bigger target.
- **Never renavigate an existing tab.** The shared-window design renavigated on
  every click; here an existing agent tab may hold scroll/chat state, so it is
  focused as-is. A stale tab (user navigated it elsewhere) stays stale by
  design — the name still identifies the agent's tab and a reload would be
  more surprising than a wrong-page focus.
- **`focus()` best-effort.** Chromium honours it from a user gesture (proven
  cross-OS-window in #6); if a browser declines, the click degrades to
  "tab exists, unfocused" — no error surface.

## Alternatives rejected

- Keep the shared worker window and add per-agent windows alongside — two
  behaviours, one glyph; confusing. The per-agent model strictly supersedes.
- `BroadcastChannel`/`postMessage` presence registry to find tabs — heavier,
  needs same-origin (fails for peer harnesses); the named-context lookup is
  the platform primitive for exactly this.
