# Understanding — Zoom the CONTENT inside the agent docks

## Goal (corrected)
Distinct from the existing **dock-size** stepper (which makes the dock *windows*
bigger/smaller): this zooms the **content rendered inside** each agent dock — the
**chat text and controls** (messages + composer) — smaller or bigger, without
changing the dock window's size. Like a zoom level for what's inside the dock.

## What I'll do (frontend only)
- A **content-zoom factor** for the dashboard docks, e.g. **0.5×–2×**, default 1×,
  stepped by ~0.1, **remembered per device** (`claudeweb_dash_content_zoom`).
- Apply it via CSS **`zoom`** to the embedded chat container in each phone dock
  (`PinnedAgent` → `.phone__screen`), so the chat's text and controls scale and
  reflow within the unchanged dock window.
- A small **"A− / A+" control** in the dashboard header (clearly "text/content
  size", separate from the existing window-size −/+ stepper), passed down to the
  docks.

## Assumptions
- Target is the **embedded chat content** in the phone-docks view (that's the
  "text and controls inside"). The summary **cards** view is just status text;
  I'll leave it unless you want it zoomed too.
- One **global** content-zoom for all docks (not per-dock).
- Uses CSS `zoom` (scales layout + text and reflows; well-supported in the
  desktop Chromium/Edge the dashboard runs in).

## Verification
- Browser-verify on an isolated instance: A−/A+ scales the chat text+composer
  inside the docks while the dock window size stays the same; persists across
  reload.
