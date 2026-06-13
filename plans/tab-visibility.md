# Tab visibility — hide/show advanced tabs

> **Status (2026-06-13):** DEPLOYED & confirmed. 16/16 headless checks
> (`.preview-test/tab-visibility-test.mjs`). Merged to main.
> Built as planned: claude/settings non-hideable, hidden = dropped from the
> advanced nav only (direct URL still resolves), switch-style toggle.
> Builds on [settings-tab.md](settings-tab.md) (the one tab registry +
> Settings UI) and reuses the [pane-widths.md](pane-widths.md) storage
> pattern. Structured per [doc-principles.md](doc-principles.md).

## Why

Advanced mode now exposes a lot of tabs (files, plan, git, history, agents,
screen, projects, guests, app, localapp, settings + the claude slot). On a
phone the bottom nav is crowded and most users only live in a handful. The
user wants to hide the tabs they don't use — per-device-independent, synced
like tab order, **advanced mode only** (Basic mode is already a curated
minimal set governed by the capability map, untouched here).

## What

A per-tab **enable/disable toggle** on each Settings card, beside the existing
drag handle / pane-width stepper / reorder arrows. Disabling a tab removes it
from the bottom nav and the desktop multi-pane strip immediately (optimistic,
backend-synced). The Settings card itself stays visible (dimmed) so the tab
can be re-enabled — Settings is the only place hidden tabs surface.

### Non-hideable tabs

- **claude** (the Chat/Term home slot) and **settings** itself are NOT
  hideable. Hiding settings would lock the user out of the toggle UI; claude
  is the app's home. Their cards show no toggle (or a disabled one).

### Storage — `hiddenTabs`

Mirror `tabWidths` exactly:

| Layer | Change |
|---|---|
| `UiSettingsService.cs` | add `List<string> _hiddenTabs`, `Store.HiddenTabs`, `HiddenTabs` getter (copy under gate), `SetHiddenTabs(...)`, Load/Save both fields |
| `SettingsController.cs` | `UiSettingsRequest` gains `List<string>? HiddenTabs`; GET returns it; PUT filters to `KnownTabs`, drops `claude`/`settings`, dedups; returns the cleaned list. Sparse (absent = nothing hidden). |
| `UiSettingsContext.jsx` | `hiddenTabs` state from GET; `saveHiddenTabs(hidden)` optimistic PUT (carries the current `tabOrder` since PUT requires it, like `saveTabWidths`) |
| `tabRegistry.jsx` | `useOrderedTabs({ includeHidden = false })`. Default: filter out hidden keys **only when `isAdvanced`** (Basic mode ignores the set). `includeHidden: true`: keep them, annotate each tab `{ hidden: bool }`. |
| `Settings.jsx` | call `useOrderedTabs({ includeHidden: true })`; render a toggle per card (skip claude/settings); dim disabled cards; `setHidden(key, on)` keeps the list sparse |
| `settings.css` | `.taborder__toggle` styles; `.taborder__item.is-hidden` dim state |
| `en.json` / `tr.json` (ASCII) | `settings.tabHiddenHint`, `settings.tabShow`, `settings.tabHide` |

`useOrderedTabs()` is the single consumer for BottomNav, PaneStrip and the
active-tab logic, so filtering there hides the tab everywhere at once. The
saved-order sort still runs over the filtered list — a hidden tab simply drops
out, the rest keep their order.

## Open decisions (discuss before building)

1. **Direct-URL access to a hidden tab.** Routes in `App.jsx` are static, so
   typing `/studio/git` still renders Git even when hidden — hidden only means
   "not in the nav". *Proposed:* leave it (clutter reduction, zero lockout
   risk; deep links and the active pane keep working). Blocking routes adds a
   redirect guard and risks stranding a user mid-task. **Confirm.**
2. **What if the active tab is hidden?** You toggle from Settings, so the
   active route is usually `settings`. If a hidden tab is still the URL (deep
   link), it renders fine (per #1) but has no nav entry. Multi-pane recomputes
   its window from the filtered list automatically. No special handling needed
   under the proposed #1.
3. **Toggle control style.** Checkbox-style switch vs. an eye icon. *Proposed:*
   a small switch with `settings.tabShow/tabHide` aria labels, matching the
   existing button look.

## Not doing (unless asked)

- Hiding Basic-mode tabs — Basic stays a fixed curated set.
- A "hide all / show all" bulk action — add later if the per-card toggles feel
  tedious.
- Route-level blocking of hidden tabs (see decision #1).

## Verification (Done criteria)

Headless on the isolated `:5201` preview (self-dev rules,
`.preview-test/tab-visibility-test.mjs`), snapshotting + restoring real
settings:

- API: PUT `hiddenTabs: ['git','bogus','settings','claude']` → stored set is
  `['git']` (unknown + non-hideable dropped); GET echoes it.
- Advanced nav: hide `git` → no git entry in the bottom nav; show it → returns.
- Multi-pane (wide viewport): hiding a tab drops it from the strip and the
  window recomputes (neighbour count adjusts).
- Persistence: survives reload (GET reflects it).
- Settings UI: hidden card stays listed + dimmed; claude/settings have no
  toggle; toggling saves to backend and the nav obeys live.
- Basic mode: hidden set ignored — the curated Basic nav is unchanged.
