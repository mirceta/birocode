# UI Modes — Basic / Advanced

> **Status (2026-06-10):** Planned, not started.

## Glossary

(Builds on the CLAUDE.md glossary: Harness, End User, Operator.)

- **UI Mode** — a device-local presentation setting of the Studio: `basic` or `advanced`
- **Basic Mode** — the End User's view: a clean messaging-app experience (Chat, Files, History, Save), nothing else
- **Advanced Mode** — the Operator/developer's view: everything, including power features
- **Capability Map** — the single source of truth assigning each feature to a mode
- **Mode Toggle** — the control that switches the UI Mode on the current device

## Problem

Every power feature added to the Studio (model selector, repo selector, App
tab, Agent Dock, build stamp) leaks into the End User's UI and erodes the
"feels like a messaging app she already knows" design goal (ANALYSIS.md). She
has one repo and no use for model switching — for her these are noise.

The Agent Dock decision made this acute: multi-agent tooling is purely an
Operator feature and should never appear in her view.

## Goal

One switch that splits the Studio into two presentations:

- **Basic Mode (default):** Chat, Files, History, Save — nothing else.
- **Advanced Mode:** everything.

From now on, each feature plan states which mode exposes the feature.
**Convention: new features default to Advanced unless the plan explicitly
promotes them to Basic.**

## Design

### 1. State: device-local, persisted

- `uiMode: 'basic' | 'advanced'`, default `'basic'`.
- Persisted in localStorage under `claudeweb_ui_mode` — survives refreshes
  and is shared by all tabs of the same browser. **Per device by design**:
  picking Advanced on the PC does not affect the phone (cross-device sync
  would require server-side state; explicitly out of scope).
- Exposed via a small `UiModeContext` mounted in Layout:
  `{ uiMode, isAdvanced, setUiMode }`.

### 2. Capability Map (one file, declarative)

`client/src/uiModes.js`:

```js
export const FEATURES = {
  chat:          'basic',
  files:         'basic',
  history:       'basic',
  saveButton:    'basic',
  languageToggle:'basic',
  appTab:        'advanced',
  repoSelector:  'advanced',
  modelSelector: 'advanced',
  agentDock:     'advanced',   // and the future Agents tab
  buildStamp:    'advanced',
};
```

Components gate themselves with one hook — `useFeature('modelSelector')`
returns whether the feature is visible in the current mode. Moving a feature
between modes is a one-line change in this file; no component edits.

### 3. Mode Toggle placement

A small toggle inside a lightweight settings popover behind the existing
gear/header area of the Studio — reachable from Basic (otherwise Advanced
could never be entered), but visually quiet so the End User has no reason to
touch it. Label the options in plain language (EN/TR i18n strings), e.g.
"Simple" / "Advanced".

### 4. What changes visibly

| Feature | Basic | Advanced |
|---------|-------|----------|
| Chat / Files / History tabs | yes | yes |
| Save button | yes | yes |
| Language toggle | yes | yes |
| App tab (bottom nav, 4th tab) | hidden | yes |
| Repo selector (header) | hidden | yes |
| Model selector (chat) | hidden | yes |
| Agent Dock / Agents tab | hidden | yes |
| Build stamp / branch label | hidden | yes |

Routes for hidden pages (e.g. `/studio/app`) keep working if typed directly —
the mode hides chrome, it is not a security boundary. Auth stays the single
shared access code.

## Out of scope

- Cross-device sync of the mode (server-side state)
- A second access code / real roles or permissions
- Per-feature user preferences beyond the single mode switch

## Files to modify

| File | Change |
|------|--------|
| `client/src/uiModes.js` | **New** — Capability Map + `useFeature` hook + UiModeContext |
| `client/src/layout/Layout.jsx` | Mount UiModeContext; gate header items (repo selector, build stamp) |
| `client/src/layout/BottomNav.jsx` | Gate the App tab entry |
| `client/src/layout/Dock.jsx` | Gate the Agent Dock |
| `client/src/components/chat/ModelSelector.jsx` | Gate via `useFeature` |
| Header / settings popover | **New** — the Mode Toggle |
| `client/src/i18n/en.json`, `tr.json` | Toggle labels |
| `CLAUDE.md` | Add the convention: new features default to Advanced |

## Risks & notes

- **She finds the toggle.** Accepted risk of the device-local approach; the
  toggle is quiet, not hidden, and nothing in Advanced is destructive beyond
  what Chat can already do.
- **Mode checks sprawl.** Mitigated by the Capability Map — components ask
  `useFeature(...)`, never compare `uiMode` directly.
- **Interaction with the Agent Dock plan:** if the Dock becomes an Agents
  tab (conversation-list presentation), it is gated the same way via the
  `agentDock` capability; DockContext/ChatContext are unaffected by mode.
