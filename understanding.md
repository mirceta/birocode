# Understanding — enlarge a dock to two horizontal spaces

## Goal

On the agent dashboard, let any agent dock **enlarge itself to span two
horizontal grid spaces** (double width), via a **toggle button placed next to
the existing "important" (★) and "depends on another agent" (🔗) controls** in
the dock header. It's a toggle — press again to return to one space. Multiple
docks can be wide at once.

## What I'll do

- **Backend:** add a `Wide` boolean to `DockTab` (default `false`), threaded the
  same way `Important` is — `DockRegistry.Update` param + DTO mapping,
  `DockController` `PatchRequest`/GET/Update, and the `toServerPatch` whitelist in
  `DockContext.jsx`. Backend-synced so the choice survives reload and is shared
  across devices, exactly like `important`/`color`/`dashboard`.
- **Frontend control:** a new toggle component (mirroring `ImportantStar`) placed
  beside the important/depends controls in **both** dock surfaces — the phone
  dock header (`PinnedAgent.jsx`) and the summary card (`Dashboard.jsx`).
- **Layout:** a wide dock's grid cell gets `grid-column: span 2` so it occupies
  two columns of the dashboard grid. Handle the dependent "together" group
  (`dash__group`) so a wide primary spans correctly.
- **Wiring:** a `toggleWide` callback in `Dashboard.jsx` (optimistic +
  backend-synced via `updateTab`, mirroring `toggleImportant`), plus i18n strings
  (en + tr).

## Assumptions

- "Two horizontal spaces" = two columns of the dashboard agent grid (double the
  normal cell width). Height is unchanged.
- No separate Advanced feature flag: this control lives inside the already
  Advanced-gated dashboard, alongside important/waiting/depends which have no
  per-control flag. (Will confirm at build time.)
