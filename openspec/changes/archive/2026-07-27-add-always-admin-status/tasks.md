## 1. Backend — always-admin endpoint

- [x] 1.1 `AlwaysAdminController.cs` (`[Route("api/always-admin")]`, `_logger.CountRequest()`): `GET /status` reads the three `Policies\System` DWORDs (Registry64) + `WindowsPrincipal.IsInRole(Administrator)`, returns `{ enableLua, consentPromptBehaviorAdmin, promptOnSecureDesktop, tokenElevated, state, supported }`; non-Windows/read-failure ⇒ `supported:false`, `state:"disabled"`, never throws
- [x] 1.2 `POST /enable`: try direct HKLM write; on `UnauthorizedAccessException`/`SecurityException` elevate once (`reg import` temp `.reg` or `cmd /c` chained `reg add`, `UseShellExecute=true`, `Verb="runas"`) — single consent; map cancelled consent (Win32 1223) to typed failure; return `{ ok, method, state }` with a fresh read (idempotent no-op if already set)
- [x] 1.3 If a service is needed for the elevation helper, add `Services/AlwaysAdmin/AlwaysAdminModuleExtensions.cs` and have the orchestrator uncomment `AddAlwaysAdminModule()` in `EmbeddedApi.cs`; otherwise keep it a drop-in controller — kept as a drop-in controller (no service needed)

## 2. Frontend — Always-admin tile

- [x] 2.1 `AdminStatusTile.jsx` (+ `adminStatusTile.css`): self-contained chip, 5 s `apiGet('/always-admin/status')` poller; render by `state` — active (green) / reboot_pending (amber) / disabled (grey + Enable button) / unsupported (inert)
- [x] 2.2 Enable flow: `apiPost('/always-admin/enable')`, in-flight disabled+spinner, re-poll on success (→ reboot_pending), declined-consent hint on failure; Enable shown only when `disabled`
- [x] 2.3 Always-visible caveat + rollback note (Store/packaged apps may not launch; rollback = `EnableLUA=1` + reboot)
- [x] 2.4 Render in `HeaderStatusStrip.jsx` `header-strip__row` behind `useFeature('adminStatus')`; add `adminStatus: 'advanced'` to `UiModeContext.jsx`; i18n keys in `en.json` + `tr.json`

## 3. Verify

- [x] 3.1 Build client + `dotnet build` (isolated self-dev dir); `GET /api/always-admin/status` returns the current box's state (expected `reboot_pending` or `active` — values set 2026-07-27)
- [x] 3.2 Playwright on an isolated port: tile shows the correct state chip; when disabled, Enable is present; caveat/rollback visible; screenshot — superseded by the Operator live-verifying the tile in the real harness on :5099
- [x] 3.3 `openspec validate add-always-admin-status --strict`
