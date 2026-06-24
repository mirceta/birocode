# Tasks — Add a harness-native OpenSpec Cockpit tab

## 1. Backend (read-only, repo-scoped)
- [x] 1.1 `OpenspecCockpitService` — C# port of the Control Room aggregation (`openspec list`/`spec list`/`validate --json`, `archive/`, `tasks.md`, delta touches) via the npm shim
- [x] 1.2 `OpenspecController` (`/api/openspec/cockpit|show|archived`) — `X-Repo-Id`/`?repo=` scoped, read-only, safe-name gated drill-in
- [x] 1.3 Readiness preflight (openspec-on-PATH + `openspec/`-present) so an uninitialised repo gets an explicit state
- [x] 1.4 DI registration: `AddOpenspecCockpitModule()` in `EmbeddedApi.cs`

## 2. Frontend (Advanced-mode tab)
- [x] 2.1 `Cockpit.jsx` + `cockpit.css` — legend, in-flight w/ completion ring, shipped, baseline, change↔baseline cross-link, drill-in
- [x] 2.2 Auto-scope to the selected repo; re-scope on switch
- [x] 2.3 Wire tab: `tabRegistry.jsx`, `App.jsx` route, `cockpitTab` flag in `UiModeContext.jsx`, `SettingsController.KnownTabs`, i18n `nav.cockpit`

## 3. Verify
- [x] 3.1 Frontend build clean; backend `dotnet build` clean (0 errors)
- [ ] 3.2 Live-verify on an isolated harness instance + headless browser: ready / not-ready / drill-in / safe-name reject / re-scope on repo switch
- [ ] 3.3 Confirm the standalone Control Room cockpit (`openspec-port-app/`) is unchanged and still works

## 4. Ship
- [ ] 4.1 `openspec validate --strict add-openspec-cockpit-harness-tab`
- [ ] 4.2 Archive on ship (fold delta into the `openspec-cockpit` baseline)
