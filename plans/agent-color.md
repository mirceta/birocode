# Agent colour marks

> **Status (2026-06-11):** In progress on branch `feature/agent-color`.

## Why

The End User runs several agents at once and wants to visually mark the ones
they are actively focused on, so the Agents tab draws the eye to them. A
per-agent highlight colour does this.

## Design

- **Pick:** each agent card carries a small round **swatch button**. Clicking
  it opens a **palette popover** of 7 preset colours plus a "clear" option.
  A fixed palette (not a free hex picker) keeps marking fast and the colours
  consistent. A full-screen backdrop closes the popover on outside click.
- **Paint:** the chosen colour is applied to the card as a 4px **left stripe**
  plus a faint `color-mix` **background wash** (12%, 18% on hover) — strong
  enough to pull focus, light enough to keep the name/branch/status readable.
- **Shared, not device-local:** the colour is a property of the agent, so it
  lives on the **backend dock model** and syncs across devices, exactly like
  the rest of the tab (plans/dock-sync.md). Old tabs with no colour render
  normally (`color` absent → null).
- The colour mark is independent of the **status dot** (green/blue/red for
  running/done/error) — different signal, different place on the card.

## Scope

Lives inside the Agents tab, which is already Advanced-only (`agentDock`), so
it inherits that gating — no capability-map change.

## What

- `ClaudeWeb.App/Services/Dock/DockRegistry.cs` — `DockTab.Color`; `Add` and
  `Update` gain a `color` param (empty string clears, null leaves untouched);
  `Clone` copies it.
- `ClaudeWeb.App/Controllers/DockController.cs` — `color` in the DTO, the
  Create/Patch request records, and the pass-throughs.
- `client/src/context/DockContext.jsx` — `toServerPatch` forwards `color`
  (empty string clears on the backend).
- `client/src/pages/Agents.jsx` — palette constant, picker state, swatch +
  popover + backdrop, card `--agent-color` / `data-colored`.
- `client/src/pages/agents.css` — swatch, popover, backdrop, colored-card.
- `client/src/i18n/{en,tr}.json` — `agents.color.label`, `agents.color.clear`.

## Verification

`.claudeweb-preview/playwright/verify-agent-color.mjs` on :5201 (own dock tab,
logs in, cleans up): swatch opens palette, picking a colour paints the card
and persists across reload (backend round-trip), clear removes it, backdrop
closes the popover.
