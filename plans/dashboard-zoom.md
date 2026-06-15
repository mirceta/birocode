# Zoom the content inside the agent docks

> **Status (2026-06-15):** **Built, browser-verified & merged to main**
> (not yet deployed). On `feature/dashboard-zoom`. Zooms the **content inside**
> each dashboard agent dock (the embedded chat's text + controls) smaller/bigger
> via a header A−/A+ control — distinct from the dock-*window*-size stepper.
> Verified on an isolated :5210 instance (`.preview-test/dashboard-zoom-check.mjs`,
> ALL PASS).

## Problem

The dashboard has a −/+ stepper that resizes the dock **windows**
(`SIZE_STEPS` in `Dashboard.jsx`). But inside a phone dock the embedded chat
(`PinnedAgent` → `.phone__screen`, a `<Chat embedded>`) renders at a fixed
scale, so the text/controls can be too small (or too big) for the window. There's
no way to zoom what's *inside* the dock.

## Design (frontend only)

- A **content-zoom factor** (`claudeweb_dash_content_zoom`, default `1`, range
  ~`0.5×–2×`, ~0.1 steps), remembered per device, held in `Dashboard.jsx`.
- A header **"A− / A+" control** (text/content size), separate from the existing
  window-size −/+ stepper, with a reset.
- Pass the factor to `PinnedAgent`; apply CSS **`zoom`** to `.phone__screen` so
  the embedded chat's text and controls scale and reflow inside the unchanged
  dock window.

## Scope

- Targets the **phone-docks** embedded chat (the "text and controls inside").
  The summary **cards** view is status text only — left as-is unless requested.

## Verification

- Browser-verify (per `docs/claude-web/browser-testing.md`) on an isolated
  instance: A−/A+ scales the chat text + composer inside the docks while the dock
  window stays the same size; the level persists across reload.
