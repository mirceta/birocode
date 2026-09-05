## ADDED Requirements

### Requirement: The management layer is available as a refresh-to-update static app

The system SHALL provide a Management App: a static page under `events-app/manage/`,
served by the harness from the repo worktree at
`/api/localview/<repo>/app/events-feed/manage/` with the same no-store, sub-path
and explicit-404 behaviour as the events feed. It SHALL offer three tabs — Arch
(the harness's Arch surface), Ideas (the Ideas panel) and Events (the events feed
page embedded) — addressable by `?tab=` and remembered per device. It SHALL derive
its API root from its own URL, call only its home harness, and use the harness
session cookie as its only credential, never storing or embedding a password.
Rebuilding the bundle and refreshing the page SHALL be the complete update cycle;
no harness restart SHALL be required.

#### Scenario: Arch from the Management App

- **WHEN** the Operator opens the app's Arch tab through the proxy path on a logged-in browser
- **THEN** it shows the same arch state, agents strip, fleet card and conversation as the harness's Management dashboard view, and arming, scoping and sending behave identically

#### Scenario: Update without a redeploy

- **WHEN** the Management App bundle is rebuilt in the worktree and the page is refreshed
- **THEN** the new bundle is served while the harness process keeps running

#### Scenario: Not logged in

- **WHEN** the app is opened by a browser without a harness session
- **THEN** it shows a banner pointing to the harness login instead of failing silently

### Requirement: The events feed links to the Management App

The events feed page SHALL offer a "Manage" link to the Management App from its tab bar.

#### Scenario: One click from the feed

- **WHEN** the Operator is on the events feed page
- **THEN** the tab bar offers a Manage link that opens the Management App at its Arch tab
