# always-admin Specification

## Purpose
TBD - created by archiving change add-always-admin-status. Update Purpose after archive.
## Requirements
### Requirement: Always-admin state is reported in the STATUS strip

The harness SHALL expose an "Always-admin" status tile in the header STATUS
strip (alongside Scoreboard, account chips, and host clock). The tile SHALL
report one of three states derived from two facts read on the host: whether the
UAC-disabling registry values are set, and whether the harness's own process
token is elevated. The registry values are `EnableLUA`,
`ConsentPromptBehaviorAdmin`, and `PromptOnSecureDesktop` under
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`; "set" means all
three equal `0`.

- **Active** — registry values set AND token elevated.
- **Reboot pending** — registry values set AND token NOT elevated.
- **Disabled** — registry values not set.

The tile SHALL be Advanced-mode and feature-gated, and SHALL follow the strip's
self-contained-chip idiom (its own poller, unmounted while the strip is
collapsed). Reading the state SHALL NOT require elevation and SHALL NOT change
any system state.

#### Scenario: Values set and token elevated reads Active

- **WHEN** the three registry values are `0` and the harness process token is
  elevated
- **THEN** the tile shows the **Active** state ("always-admin is live")

#### Scenario: Values set but reboot not yet applied reads Reboot pending

- **WHEN** the three registry values are `0` but the harness process token is
  still the filtered (non-elevated) token
- **THEN** the tile shows the **Reboot pending** state indicating a restart is
  required before always-admin takes effect

#### Scenario: Values not set reads Disabled

- **WHEN** any of the three registry values is absent or non-zero
- **THEN** the tile shows the **Disabled** state (normal UAC) regardless of
  whether the harness token happens to be elevated

#### Scenario: Unsupported host degrades gracefully

- **WHEN** the host is not Windows or the registry values cannot be read
- **THEN** the status read returns without throwing and the tile shows an inert
  "unsupported" indication rather than an error

### Requirement: Enable writes the elevation registry values

When the state is Disabled, the tile SHALL offer an **Enable** action that writes
`EnableLUA=0`, `ConsentPromptBehaviorAdmin=0`, and `PromptOnSecureDesktop=0` as
`REG_DWORD` values at the Policies\System key. The write SHALL be attempted
directly first; if the harness lacks the rights, it SHALL elevate and perform all
three writes in a **single** elevated action so at most **one** UAC consent is
raised on the host desktop. The action SHALL NOT reboot the machine. After a
successful write the tile SHALL show the **Reboot pending** state (restart
required) until a reboot flips the token to elevated. Writing already-set values
SHALL be a successful no-op.

#### Scenario: Enable on a disabled host writes the values and shows restart required

- **WHEN** the Operator taps **Enable** while the state is Disabled and the write
  succeeds (directly or after granting the UAC consent)
- **THEN** the three registry values are set to `0` and the tile transitions to
  **Reboot pending** (restart required)

#### Scenario: Declined UAC consent leaves state unchanged

- **WHEN** the Operator taps **Enable** but declines/cancels the UAC consent
- **THEN** no registry value is changed, the state stays Disabled, and the tile
  reports that the consent was declined

#### Scenario: Enable is only offered when disabled

- **WHEN** the state is Active or Reboot pending
- **THEN** the tile does not present the Enable action (there is nothing to
  enable)

### Requirement: The tile surfaces the UAC-off caveat and rollback

The tile SHALL make the consequences of disabling UAC visible without extra
navigation: that Windows Store / packaged apps (for example Windows Terminal) may
fail to launch while UAC is off, and that the rollback is to set `EnableLUA=1` and
reboot. This SHALL be shown in both supported UI locales (English and Turkish).

#### Scenario: Caveat and rollback are visible on the tile

- **WHEN** the Operator views the Always-admin tile in either the Active,
  Reboot-pending, or Disabled state
- **THEN** the tile presents the packaged-app caveat and the `EnableLUA=1` +
  reboot rollback note

