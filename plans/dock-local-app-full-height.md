# Local app fills the dock — hide the git block while it's open

**Status:** done — user-confirmed working, deployed from `feature/dock-local-app-full-height`.

## Problem

In the agent dashboard, each dock (the per-agent "phone") shows a **local-app
switcher** (`plans/dock-multi-local-app.md`): tapping an app badge swaps
`phone__screen` from the chat to a `ProductFrame` iframing
`/api/localview/{repoId}/app/{appId}/`. But the dock's **git block**
(`phone__git` — status summary + sync actions) stays rendered **above** the
screen, so the open app is squeezed into only the height *below* git. A web app
needs as much vertical room as the dock can give.

## What we want

When a local app is open, render it **over** the git section — i.e. hide
`phone__git` so the `ProductFrame` gets the **full dock height**, exactly the
way the **Files tab** already does it (`plans/agent-dock-files-tab.md`). Picking
an app hides git; closing the app (toggling it off, or switching back to a
Builder/Ask lane) brings git back.

## Approach

`client/src/components/dashboard/PinnedAgent.jsx` already gates the git block on
`git && !showFiles` (the Files-tab follow-up). Extend that gate to also exclude
an open app: `git && !showFiles && !openApp`. Update the explaining comment so
it covers both the Files tab and an open local app. No CSS, backend, or i18n
changes — `phone__screen` is already a flex child that fills whatever height is
left, so reclaiming git's row just makes the frame taller.

## Verify

Browser-verify on an isolated preview port: open a dock, tap a local-app badge,
assert the `.phone__git` block is gone and `.phone__screen` (the frame) grew to
fill the dock; toggle the app off and assert git returns.
