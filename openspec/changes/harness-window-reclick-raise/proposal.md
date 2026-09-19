# Harness window: a re-click raises the agent's tab, not the launcher

## Why

Operator report, 2026-09-19, right after PR #124 (openspec `harness-window-agent-tabs`) went
live: with "One dedicated harness window" + "One tab per agent", the first click on a repo agent
opens its tab inside the harness window, but the **second** click on that agent brings the
harness window's **launcher tab** to the front instead of the agent's tab.

Measured in headed Chrome (`.claudeweb-preview/playwright/check-harness-reclick.mjs`, focus
emulation switched off so `document.hasFocus()` is the real active tab):

| step | current code | what the Operator sees |
|---|---|---|
| A, then A again while A is still the active tab | A stays on top | fine |
| A, then B, then A again | the **launcher** tab has focus, A does not | the report |

Two Chrome facts explain it, both new since `check-harness-tabs.mjs` (which only checked that the
re-click returned "focused" and did not reload):

1. `window.focus()` called by the launcher never raises an agent tab that is not already the
   active one (the launcher has no user activation; the click happened on the dashboard).
2. `window.open('', name)` on an **existing** name, from the page holding the click's activation,
   **does** raise that tab. The dashboard did exactly that on every click — for the **launcher's**
   name, to get its handle — which is why the launcher came to the front.

## What changes

- The dashboard keeps the launcher's handle after the first lookup (per dashboard window) and
  reuses it while that tab lives; it looks the launcher up by name again only when there is no
  live handle (first click, launcher closed). No lookup, no raised launcher.
- When the launcher answers "focused" (the agent's tab already exists), the dashboard raises that
  tab itself with `window.open('', <agent name>)` from its own click — Chrome activates the
  existing named tab wherever it lives (the dashboard is familiar with every tab its launcher
  opened; measured: the lookup returns the very tab the launcher holds, no new page). If a lookup
  ever came back blank the stray tab is closed at once, so a click never leaves an empty tab.
- A launcher tab the Operator browsed away from (same origin, another page) is sent back to the
  launcher URL instead of timing out as "no launcher".

Measured after the change (variants `cached+dashopen` in the same script): A / B / A → A has
focus, launcher and dashboard do not, zero new pages.

## Not in scope

Chrome's activation model itself, the popup-blocker step (still one-time "allow pop-ups"), the
single-viewer mode and the tabs-beside-the-dashboard mode — all unchanged.
