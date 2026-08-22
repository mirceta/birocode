# claude-in-chrome — tasks

## 1. Backend

- [x] 1.1 `ChromeGateService` (singleton): global single-holder gate (`TryAcquire(repoName)` / `Release()`) + cached host checks (native-messaging registry key, CLI `--chrome` support via `claude --help`)
- [x] 1.2 `ChromeController`: `GET /api/chrome/status` → `{ available, hostRegistered, cliSupported, busy, busyRepo }`
- [x] 1.3 `ChatRequest` gains `Browser`; `ChatController.Chat` normalizes (builder lane only), acquires the gate (409 naming holder on conflict), releases in the detached run's `finally`
- [x] 1.4 `CliRunnerService.RunAsync`/`CreateProcessInfo`/`BuildDisplayCommand` gain `browser` → append `--chrome`
- [x] 1.5 Register the service/controller in DI (per `plans/INTEGRATION.md` conventions)

## 2. Frontend

- [x] 2.1 Capability `browserMode: 'advanced'` in `UiModeContext.jsx`
- [x] 2.2 `ChatContext`: device-local `browserOn` state (localStorage) + `browser: true` on builder-lane sends while on
- [x] 2.3 Chat toolbar toggle (🌐) — hidden in Ask view; fetches `/api/chrome/status` when toggled on; shows unavailability reason / busy state
- [x] 2.4 i18n strings for the toggle + status states

## 3. Docs & verification

- [x] 3.1 `docs/claude-in-chrome.md` — agent-agnostic usage doc: address-by-URL, tab groups & operator drag, single-holder pipe, auth requirement, batch/tabId traps, stall behavior
- [x] 3.2 Build client + harness (isolated per self-dev rules); fix warnings introduced
- [x] 3.3 Headless verify: `/api/chrome/status` correct on this box; a chat POST with `browser:true` spawns a command line containing `--chrome` (visible in call log/display command); ask-lane POST with `browser:true` does not
- [x] 3.4 Second concurrent browser POST returns 409 naming the holder

## 4. Follow-up (dock surface)

- [x] 4.1 Dashboard-dock chats (embedded `<Chat>`) show the same 🌐 toggle: facade exposes `browserOn`/`setBrowserOn`/`lane`, visibility keyed on the dock's lane instead of `!embedded`
