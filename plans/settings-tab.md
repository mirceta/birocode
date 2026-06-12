# Settings tab — rearrangeable tab order

> **Status (2026-06-12):** Planned, on `feature/settings-tab`. Not yet built.

## Problem

The nav tab order is hardcoded (and duplicated!) in `BottomNav.jsx` and
`PaneStrip.jsx` — the user can't put their most-used tabs where their thumb
lives, and the order also silently decides multi-pane neighbours
([multi-pane](multi-pane.md)).

## Design

A new **Settings tab** (route `/studio/settings`, ⚙ icon, last in the
default order) hosting sections of app preferences — first section:
**Tab order**.

### Tab order UI

A vertical list of tab cards (icon + name), reorderable two ways:

- **Drag** — pointer-based (works for touch and mouse; no library), with a
  lift shadow and animated slide of the displaced cards.
- **↑ / ↓ buttons** on each card — the phone-reliable fallback, same
  animation.

The bottom nav reorders **live as you move cards** (instant preview — the
"beautiful" part is seeing the real nav obey), plus a "Restore default
order" button. The Chat/Term pair stays ONE item ("Claude") since it shares
a slot ([terminal-sessions](terminal-sessions.md)); tabs gated to Advanced
mode show a small badge in the list.

### Storage — backend-synced

`%APPDATA%\ClaudeWeb\uisettings.json` via `GET/PUT /api/settings/ui`
(`{ tabOrder: ["claude", "files", …] }`). Backend-synced rather than
device-local per the user's standing preference (phone and desktop are used
interchangeably — same call as prompt-stash). Single-operator app → one
global order. Order entries are tab KEYS; unknown keys are ignored and tabs
missing from the saved order append at their default position — so future
tabs ship without migrations.

### The refactor that pays for itself

`BottomNav.jsx` and `PaneStrip.jsx` currently each hardcode the list with a
"keep in sync" comment — extract ONE canonical tab registry
(`client/src/layout/tabRegistry.jsx`: key, path, label-key, icon, element,
capability) plus a `useOrderedTabs()` hook (capability-filter → apply saved
order). Both consumers shrink to rendering; the sync comment dies.

### Decisions

- `settingsTab: 'advanced'` capability (convention default; promotable
  later like projects was).
- Settings itself is reorderable too — it's just a tab.
- Multi-pane neighbours follow the custom order by construction (the hook
  is the single source).

## Implementation

1. Backend: `Services/Settings/UiSettingsService.cs` (load/save JSON,
   atomic write) + `SettingsController` (`GET/PUT /api/settings/ui`) +
   module extension. PUT validates keys against known tabs.
2. Frontend: `tabRegistry.jsx` + `useOrderedTabs()`; rewire BottomNav and
   PaneStrip; `pages/Settings.jsx` + `settings.css` (drag + buttons +
   restore); route; `settingsTab` capability; i18n en/tr.
3. Atomic file writes (temp + rename) — the 2026-06-12 registry-clobber
   lesson applies to every %APPDATA% store this app grows.

## Verification

`verify-settings-tab.mjs` on :5201: settings tab renders the full list;
↑/↓ reorders and the bottom nav updates live; order persists across reload
(file-backed, fetched fresh); restore-default works; a saved order with an
unknown key + a missing key degrades gracefully; multi-pane neighbours
follow the new order (wide viewport). Screenshot read before claiming
success.
