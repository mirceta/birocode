## Why

Local apps are embedded at their natural size: the dock's local-app view squeezes a
full product into a small tile, and on the phone's Local tab some products render too
large or too small for the screen. Browser zoom is no help — it scales the whole
harness UI along with the embedded app. The user needs to zoom just the embedded local
app, independently of the surrounding harness chrome.

## What Changes

- Add a per-frame zoom control to the embedded local-app view on both surfaces that
  embed a local app through the `/api/localview/<repoId>/app/<appId>/` proxy:
  - the **dashboard agent dock's** local-apps view (`PinnedAgent` → `ProductFrame`), and
  - the **Local tab** on the phone (`LocalApp` → `ProductFrame`).
- Zooming scales **only the embedded app's iframe content** (CSS transform scale with
  compensating layout size on the shared `ProductFrame`); the harness UI around it —
  dock chrome, tab navigation, composer — is not affected.
- Zoom in / zoom out steps plus a reset-to-100% affordance; the current zoom level is
  visible while it is not 100%.
- Zoom level is per-surface client-side UI state (each dock's frame and the Local tab
  zoom independently); it is ephemeral and resets to 100% on reload, consistent with
  the dock's maximize-chat state.
- The Local tab's zoom control counts as a **viewing** control, so it is available in
  Basic mode too (the phone/End-User surface is an explicitly requested target); the
  dock's control lives behind the dock's existing Advanced gate.

## Capabilities

### New Capabilities

- `local-app-zoom`: zooming an embedded local app independently of the harness UI —
  the control, the scaling behavior, per-surface independence, ephemerality, and
  mode gating across the two embedding surfaces (agent dock, Local tab).

### Modified Capabilities

<!-- none — local-app-tab's view-only Basic contract already admits viewing controls
     ("the app switcher, the embedded product frame, a refresh action, and an
     open-in-new-tab link"); adding zoom is covered by the new capability's own
     requirements rather than changing existing ones. If review decides the Basic
     view-only enumeration in local-app-tab must literally list zoom, that becomes a
     delta on local-app-tab during the specs phase. -->

## Impact

- `client/src/components/app/ProductFrame.jsx` — the shared embed component; gains the
  scale wrapper and (optionally) the zoom controls, driven by props/state.
- `client/src/components/app/product.css` (and `client/src/pages/localapp.css`,
  `client/src/pages/dashboard.css` as needed) — transform/overflow styling so the
  scaled iframe stays clipped and scrollable inside its frame.
- `client/src/pages/LocalApp.jsx` — hosts the zoom control on the Local tab.
- `client/src/components/dashboard/PinnedAgent.jsx` — hosts the zoom control in the
  dock's local-apps view.
- `client/src/context/UiModeContext.jsx` — capability-map entry if zoom is gated
  separately from its host surfaces.
- `client/src/i18n/en.json`, `client/src/i18n/tr.json` — labels for the new controls.
- No server/API changes: purely client-side presentation over the existing
  `/api/localview/...` proxy. Other `ProductFrame` consumers (App tab preview,
  Landing) are out of scope and keep today's behavior.
