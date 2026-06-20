# Enlarge a dock to two horizontal spaces

> **Status (2026-06-20):** BUILT — compiles clean (frontend `npm run build` +
> backend `dotnet build`, 0 errors), feature present in the bundle. Frontend
> serves from the working tree, so it is already live on `:5099` (the ⤢ button
> shows and widens a dock in-session via optimistic `updateTab`). **Backend
> `DockTab.Wide` is NOT yet deployed** to the live bin, so a wide mark won't
> survive a reload until the bin swap (`swap.ps1`, off-sandbox). Not yet
> browser-verified on an isolated preview (preview-launch commands —
> robocopy/Start-Process — are blocked by the current sandbox/permissions). On
> `feature/dock-double-width`.

## Problem

Every agent dock on the dashboard is one grid cell wide. Some agents are the
focus of attention (the one actively building, the mission-critical repo) and
deserve more room than the wall-of-phones gives them — but today the only size
controls are the global per-device stepper (scales *all* docks) and content
zoom. There's no way to say "make **this** dock bigger" while the others stay
compact.

## Goal

A per-dock **toggle** that enlarges a dock to span **two horizontal grid
spaces** (double width). A toggle — press again to return to one space; multiple
docks may be wide at once. The button sits **next to the existing ★ "important"
and 🔗 "depends on" controls** in the dock header (the spot the user pointed at).

## Design

Mirror the **`important`** flag end-to-end — the same backend-synced boolean
pattern (`plans/important-agents.md`), so the choice persists across reload and
is shared across devices.

- **Backend** (`DockTab`): add `bool Wide` (default `false`), threaded exactly
  like `Important`: `DockRegistry.Update` param + `ToDto`, `DockController`
  `PatchRequest` / GET dto / `Update` call.
- **Client sync** (`context/DockContext.jsx`): add `if ('wide' in patch)` to
  `toServerPatch` so `updateTab(id, { wide })` reaches the backend.
- **Toggle wiring** (`pages/Dashboard.jsx`): a `toggleWide(id)` callback
  (optimistic + backend-synced via `updateTab`, copy of `toggleImportant`),
  passed to both dock surfaces.
- **Control component:** a small toggle (copy of `ImportantStar` —
  a `role="button"` span that `stopPropagation`s so it doesn't open the agent)
  rendered beside the important/depends controls in **both** the phone dock
  header (`components/dashboard/PinnedAgent.jsx`) and the summary card
  (`Dashboard.jsx` `renderDock` cards branch). Icon: a widen glyph (e.g. ⤢ / ⇔).
- **Layout** (`pages/dashboard.css`): a wide dock's grid cell gets
  `grid-column: span 2`. The grid already uses fixed-width tracks
  (`repeat(columns, minmax(0, Npx))`), so `span 2` yields a genuine
  double-width cell. Apply the span to the **`dash__group`** wrapper too when a
  wide dock is a dependent's primary, so the "together" group spans correctly.

## Decisions / open questions

- **Gating:** no separate Advanced flag — the control lives inside the already
  Advanced-gated dashboard, like important/waiting/depends. (Confirm at build.)
- **Both views?** Wide applies in the phones/hot grid for sure; decide whether
  the cheap **cards** grid also honours span 2 (likely yes, for consistency).
- **Glyph + i18n:** pick the widen icon and add `dashboard.markWide` /
  `dashboard.unmarkWide` to `en.json` + `tr.json`.
- **Interaction with the per-device size stepper:** wide is multiplicative on top
  of whatever `SIZE_STEPS` factor is active (span 2 of the current track width) —
  no special-casing needed.

## Verification (planned)

Browser-verify on an isolated `:5210`/`:5201` preview: toggling the button makes
the dock occupy two columns and persists across reload (and via the dock API);
toggling off returns it to one; a wide primary with a dependent still groups
correctly; works in both card and phone views as decided. Then deploy to live
`:5099` per the self-dev deploy rule.
