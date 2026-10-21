# Proposal: registry-store-resilience — the repo registry never seeds or saves over a store it could not read

## Why

On 2026-10-21 the living-room harness lost its whole agent roster. During the watchdog pile-up
(97 `ClaudeWeb.exe` starting within an hour, each one loading the registry and saving it at boot to
pin the self repo) one instance hit a transient read failure on `repositories.json`. `Load` treated
"unreadable" exactly like "first run": it seeded the template entry from `AppConfig.WorkingDirectory`
(`C:\Users\km\Desktop\claude-web-workspace`, a path from another machine) and a **new** self id,
then `Save` wrote that over the real store. The dock kept its 14 tabs pointing at the old ids, so the
UI showed every agent as "the same repository" with only Claude Web registered. The store was
rebuilt by hand from the dock's ids and an August copy of the file; the clobbered file is kept as
`repositories.clobbered-2026-10-21.json`.

Two defects, both in `RepositoryRegistry`: an unreadable store is indistinguishable from a missing
one, and a save is a plain overwrite with no backup and no atomicity.

## What

- `Load` seeds **only when no store (and no backup) exists**. An existing store is read with a few
  retries (the failure that bit us is another instance writing at the same instant); a store that is
  blank (a truncated write) or unparseable falls back to the `.bak`; when that fails too the
  registry runs **read-only**: nothing seeded, nothing persisted, one loud log line, until restart.
- `Save` keeps the previous store as `repositories.json.bak`, writes to a temp file and swaps it in.
- Tests for every branch.

## Out of scope

The watchdog's own defect (relaunching while the port is still held, the exe not exiting on a bind
failure) — the pile-up that created the race. Noted in memory, proposed separately.
