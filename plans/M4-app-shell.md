# M4: Frontend App Shell

**Blocked by:** M0
**Blocks:** M5, M6, M7 (all frontend modules plug into this shell)

## Goal

The layout, routing, and navigation skeleton. All frontend modules
will render their content inside this shell.

## Files You Own

- `client/src/App.jsx` -- routing setup
- `client/src/layout/` -- Layout component, bottom nav, header
- `client/src/pages/` -- placeholder page components only
  (M5, M6, M7 will replace the placeholder content)
- `client/src/components/shared/` -- Loading, Error, SaveButton
- `client/src/styles/` -- global CSS, variables, reset

## What to Build

- Bottom navigation bar with 3 tabs: Chat, Files, History
- React Router with routes: `/` (chat), `/files`, `/history`
- Global "Save" button -- always visible (top-right or floating FAB)
  - The button itself lives here; M7 provides the click handler
  - For now, make it call `window.alert("Save not implemented yet")`
- Loading spinner component (reusable)
- Error display component (reusable)
- Mobile-first CSS:
  - Large touch targets (minimum 44px)
  - Readable fonts (minimum 16px body)
  - Max-width container for desktop (don't stretch to full width)
  - Bottom nav fixed at bottom, content scrolls above it

## UX Rules (Apply Everywhere in the App)

These rules apply to ALL modules, not just this one. But this module
sets the foundation:

- **No technical jargon** in the UI. These words must never appear:
  git, commit, repository, CLI, session, token, branch, checkout
- **Warm, approachable design** -- not a developer tool aesthetic
- **Maximum 2 taps** to reach any feature
- **Instant feedback** on every action (loading states, streaming text)

## Placeholder Pages

Create simple placeholder components for each route so the app is
navigable immediately. Each placeholder should just show a centered
title like "Chat", "Files", "History". M5, M6, M7 will replace these.

## Verify

- Open browser at mobile viewport (375px wide)
- Bottom nav shows 3 tabs with icons/labels
- Tapping each tab navigates to its placeholder page
- Save button is visible on all pages
- Desktop viewport (1200px) looks reasonable (centered, not stretched)

## Do Not Touch

- Any files under `ClaudeWeb.App/` (M1, M2, M3)
- Do not build actual chat, file browser, or history functionality
  -- just the shell and placeholders
