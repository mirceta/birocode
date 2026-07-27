# Design — add-always-admin-status

## State model (the source of truth)

Two independent facts drive the whole tile:

1. **`registrySet`** — all three values present with the disabling settings:
   `EnableLUA == 0` **and** `ConsentPromptBehaviorAdmin == 0` **and**
   `PromptOnSecureDesktop == 0`, read from
   `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`.
   Missing key/value ⇒ treat as not-set (normal UAC). Read is non-privileged, so
   `GET status` never needs elevation.
2. **`tokenElevated`** — whether the harness's *own* process token is elevated,
   via `new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)`.
   This is the reboot proxy: with `EnableLUA=0` **applied** (post-reboot) every
   admin process runs elevated, so this reads `true`; with the value written but
   the reboot still pending, the account keeps handing out the filtered token, so
   it reads `false`.

Derived `state`:

| `registrySet` | `tokenElevated` | `state`          | Meaning                                   |
|:-------------:|:---------------:|------------------|-------------------------------------------|
| false         | any             | `disabled`       | Normal UAC — offer Enable                  |
| true          | false           | `reboot_pending` | Values written, reboot not yet applied     |
| true          | true            | `active`         | UAC-off is live                            |

The endpoint returns the raw trio + `tokenElevated` + the derived `state`, so the
tile renders from `state` but the raw values are available for a tooltip/details.

Edge: a box can read `tokenElevated=true` with `registrySet=false` (Operator
launched the harness elevated under normal UAC). That is correctly `disabled` —
UAC is still on; the harness just happens to be elevated. Token elevation only
*promotes* the enabled reading to Active, it never fabricates Active on its own.

## Backend — `AlwaysAdminController` (`api/always-admin`)

Attribute-routed controller (`[ApiController] [Route("api/always-admin")]`),
auto-discovered by `AddControllers()`, calls `_logger.CountRequest()` per the
INTEGRATION conventions. Two actions:

- **`GET /status`** — read the three DWORDs from `Registry.LocalMachine` (64-bit
  view; the Policies key is not WOW-redirected but open the `Registry64` view to
  be explicit), compute `tokenElevated`, return the JSON above. Pure read, always
  200; on a non-Windows host or a read failure it returns `state:"disabled"`,
  `supported:false` rather than throwing, so the tile degrades to an inert
  "unsupported" chip.

- **`POST /enable`** — write `EnableLUA=0`, `ConsentPromptBehaviorAdmin=0`,
  `PromptOnSecureDesktop=0` (all `REG_DWORD`).
  1. **Try direct** `Registry.LocalMachine.OpenSubKey(path, writable:true)` and
     set all three. If the harness is already elevated this succeeds with **no
     prompt**.
  2. **On `UnauthorizedAccessException`/`SecurityException`, elevate once.** Write
     all three in a **single** elevated action so there is **one** UAC consent,
     not three: shell-execute `reg.exe import` on a temp `.reg` file (or
     `cmd /c` chaining three `reg add`) with `ProcessStartInfo { UseShellExecute
     = true, Verb = "runas" }`. The consent appears on the **host** desktop —
     the Operator answers it; the End User on the phone cannot. Wait for exit,
     map a non-zero/cancelled (`Win32Exception` 1223) to a typed failure.
  3. Return `{ ok, method: "direct"|"elevated", state }` where `state` is a fresh
     read (it will be `reboot_pending` on success, since the token won't flip
     until reboot).

  `POST /enable` is a mutation; it does not itself reboot. Idempotent: writing
  already-set values is a no-op success.

**No `POST /disable` in this change.** Rollback (`EnableLUA=1` + reboot) is a
deliberate, rarely-wanted step with a real reboot cost; exposing it as a one-tap
toggle next to Enable invites accidental UAC re-arming. The tile *documents* the
rollback (set `EnableLUA=1`, reboot) rather than automating it. A future change
can add Disable if the Operator wants it.

## Frontend — `AdminStatusTile`

- Self-contained chip in `HeaderStatusStrip.jsx`'s `header-strip__row`, gated on
  `useFeature('adminStatus')` (declared `'advanced'` in `UiModeContext.jsx`), its
  own 5 s `apiGet('/always-admin/status')` poller — same idiom as `HostClock` /
  `AccountChips`, so it is unmounted (and stops polling) while the strip is
  collapsed.
- **Render by `state`:** `active` → green "Always-admin active"; `reboot_pending`
  → amber "Enabled — restart required"; `disabled` → grey "UAC on" **plus an
  Enable button**; `supported:false` → inert "Unsupported (Windows only)".
- **Enable flow:** button → `apiPost('/always-admin/enable')`, disabled+spinner
  while in flight; on success re-poll and fall into `reboot_pending`; on the
  UAC-cancelled failure show a "consent declined — try again" hint. The button is
  only shown in `disabled`.
- **Caveat + rollback** are always present (a small details/tooltip line under
  the chip, or an info affordance): "UAC off may block Store/packaged apps (e.g.
  Windows Terminal). Rollback: set EnableLUA=1 and reboot." i18n both locales.

## Alternatives considered

- **Client-side wall-clock / registry guess:** impossible — the browser can't
  read HKLM or the process token. The read must be a backend endpoint (mirrors
  how `HostClock` gets host time from `GET /api/host-time`).
- **Three separate `reg add` elevations:** three UAC prompts for one logical
  action. Rejected — batch into one elevated invocation.
- **Auto-reboot after Enable:** too destructive to trigger from a phone tap;
  surface "restart required" and let the Operator reboot.
- **Ship a Disable toggle now:** rejected for this change (see backend note).
