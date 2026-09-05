## 1. Build

- [x] 1.1 `client/src/manage/FleetStatus.jsx`: filter bar (search, machine chips,
      state chips incl. managed, clear), counts over the narrowed set, "N of M" in the
      head, collapsed machines, per-device persistence (`manageapp.fleetFilters`).
- [x] 1.2 `client/src/manage/manage.css`: bar layout, search field, dark machine chip,
      collapsed machine, clear button.
- [x] 1.3 Rebuild the harness client and the Management App bundle.

## 2. Verify

- [x] 2.1 Browser check on an isolated instance (`.claudeweb-preview/playwright/
      verify-fleet-filters.mjs`, detached, `@@FLEETFILTERS@@` marker): bar renders with
      one chip per machine; toggling a machine hides the others; search narrows and the
      head reads "N of M"; state chip counts follow the selection; clear resets; the
      selection survives a reload; no page errors.
      DONE 2026-09-05 22:53 — `@@FLEETFILTERS@@ pass:true, 20 checks` (log
      `.claudeweb-preview/out-fleet-filters.log`, evidence stamp 2026-09-05T20-52-59):
      5 machine chips, 16 agents, one-machine → 1 section, search narrows to 1, no-match
      note + collapsed machines, clear resets, selection persisted across reload.

## 3. Ship

- [ ] 3.1 Deploy with `swap.ps1` and keep on the operator's instruction.
