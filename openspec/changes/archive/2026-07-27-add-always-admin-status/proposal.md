# Always-admin status tile + enabler in the header STATUS strip

## Why

On Windows, UAC hands even an administrator account a **filtered** token by
default: every process the harness spawns (Claude Code, git, `reg`, deploy
scripts) starts non-elevated, so anything needing admin rights either throws a
UAC prompt the End User on the phone can't answer, or fails silently with a
"not running as administrator" error. We already hit this in practice — the
auto-rollback dead-man's switch needed an elevation fix (see
`project_deadman_switch_inert`).

The durable, machine-wide cure is to turn UAC off at the master switch:
`EnableLUA=0` (with `ConsentPromptBehaviorAdmin=0` and
`PromptOnSecureDesktop=0`) under
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`. Once set —
**and after a reboot** — every process of an admin account runs with full admin
rights, no prompts. Right now this is invisible: the Operator has no way to see
whether the box is in that state, whether a reboot is still pending, or to flip
it from the UI. A prior agent set these values on this machine on 2026-07-27, so
the box should already read "enabled" (reboot may still be pending).

This is a deliberate security-posture change, not a repo-convention break — but
it is real: with UAC off, Windows Store / packaged apps (e.g. Windows Terminal)
may refuse to launch, and the whole account loses UAC isolation. The tile must
therefore make the state legible, make enabling a conscious click, and spell out
the caveat and the rollback.

## What Changes

- **New status tile — "Always-admin"** — added to the header STATUS strip
  (`HeaderStatusStrip.jsx`), the same full-width bar that already holds
  Scoreboard, account chips, and host clock. It is Advanced-mode, feature-gated,
  and follows the strip's self-contained-chip idiom (own poller, unmounted when
  the strip is collapsed).
- **STATUS read** — the tile polls a new endpoint that reads the three registry
  values **and** checks whether the harness's own process token is actually
  elevated, and reports one of three states:
  - **Active** — registry set *and* token elevated (UAC-off is live).
  - **Reboot pending** — registry set but token still filtered (values written,
    reboot not yet applied).
  - **Disabled** — registry not set (normal UAC).
- **ACTION — Enable** — when Disabled, the tile offers **Enable**, which writes
  the three registry values. Writing `HKLM` needs elevation, so on a box where
  the harness isn't already elevated this triggers one UAC consent on the host
  desktop (expected). After a successful write the tile shows **Reboot pending /
  restart required** until the reboot flips the token to Active.
- **Caveat + rollback, always visible** — the tile surfaces that packaged/Store
  apps may not launch under UAC-off, and states the rollback (`EnableLUA=1` +
  reboot). No Disable button in this change (rollback is a deliberate,
  documented manual step, not a one-tap toggle) — see Design.

## Impact

- **New capability spec:** `always-admin` (this change's delta).
- **New backend:** `ClaudeWeb.App/Controllers/AlwaysAdminController.cs`
  (`GET /api/always-admin/status`, `POST /api/always-admin/enable`) — reads
  registry + token elevation, and performs / elevates the registry write. If it
  needs a service (elevation helper), one `Services/AlwaysAdmin/…ModuleExtensions.cs`
  wired by the orchestrator per `plans/INTEGRATION.md`; otherwise it is a
  drop-in controller like `HostTimeController`.
- **New frontend:** `client/src/components/dashboard/AdminStatusTile.jsx`
  (+ `adminStatusTile.css`), rendered in `HeaderStatusStrip.jsx`'s
  `header-strip__row`; a new `adminStatus` capability key in
  `client/src/context/UiModeContext.jsx` (default `'advanced'`); i18n keys in
  `client/src/i18n/en.json` and `tr.json`.
- **Windows-only, any machine:** registry paths and the elevation/token checks
  are standard and machine-independent; on non-Windows or if the values can't be
  read the endpoint reports Disabled/unknown gracefully rather than throwing.
- **Security:** enabling turns off UAC for the account after reboot. The tile
  makes this explicit; nothing is changed without the Operator's Enable click
  (and the host UAC consent it may raise).
- No change to auth (endpoint is under the global `/api/*` password gate), the
  dashboard overlay, or any existing tile.
