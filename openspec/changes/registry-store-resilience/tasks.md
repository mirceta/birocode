## 1. Registry

- [x] 1.1 `Load`: seed only when neither store nor `.bak` exists; `TryLoadStore` with 5 retries on
      `IOException`, blank = truncated; fall back to `.bak`; else `ReadOnly` + error line.
- [x] 1.2 `Save`: refuse while `ReadOnly` (one warning); copy the current store to `.bak`; write
      `.tmp`, `File.Move(overwrite)`.
- [x] 1.3 Tests `RepositoryRegistryStoreTests`: no store seeds as before; unparseable store is never
      seeded or saved over (incl. the boot-time self pin); blank store; backup fallback + restore on the
      next save; `.bak` on every save; a good store loads.

## 2. Recovery of the living room (done by hand, 2026-10-21 12:58)

- [x] 2.1 Rebuilt `repositories.json` from the dock's 14 repo ids + names and the August copy's paths
      and settings (`.claudeweb-deploy/stage-registry.mjs`); stopped live, swapped the file, started one
      exe, resumed the watchdog (`.claudeweb-deploy/restore-registry.ps1`). 14 repos, handles backfilled,
      14 dock tabs resolve. Clobbered file kept as `repositories.clobbered-2026-10-21.json`.
