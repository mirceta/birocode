# Design — ideas-harness-hub

## Context

`ideas-drive-sync` split the sync problem into a dumb client (`IdeasSyncClient` /
`IdeasSyncService`) and a shared-store endpoint whose whole contract is:

```
GET  <url>?fn=get            → { ok:true, rev:N, store:{Ideas,Tombstones} }
POST <url> { baseRev, store } → { ok:true, rev:N+1 }
                              | { ok:false, conflict:true, rev, store }   (CAS miss)
always HTTP 200; failures are { ok:false, error } in the body
```

The only shipped implementation is a user-deployed Google Apps Script. This change
adds a second implementation **inside the harness**, so one harness (the "hub") is
the store and the others point their existing sync client at it.

## Goals / Non-Goals

- **Goal**: zero human setup beyond toggle + copy-paste; client code untouched.
- **Goal**: no second persistence model — the hub's board IS the shared board.
- **Non-goal**: multi-board hosting, per-board ACLs, hub failover. One harness, one
  board, one token.
- **Non-goal**: retiring the Apps Script path (still valid when no harness is
  reachable from the others).

## Decisions

### D1 — Hub backing store is the hub's own `NotesService`
`GET` answers with `Snapshot()` + the current rev. `POST` CAS-checks `baseRev`
against the current rev, applies the uploaded store via the existing commutative
`MergeFrom`, bumps and persists the rev, and answers with the merged snapshot's rev.
A stale `baseRev` answers `conflict:true` + the current snapshot (the client
re-merges and retries — same choreography as against the Apps Script).

Because `MergeFrom` merges rather than overwrites, a hub POST can never clobber
hub-local edits, even though the wire contract says "upload the whole store" — the
hub is strictly safer than the Apps Script file store here.

`MergeFrom` deliberately does not raise `Changed`, so a remote POST bumps the rev
exactly once (in the hub handler). A **local** edit on the hub raises `Changed`;
the hub subscribes and bumps the rev so remote pollers see movement. (Pollers merge
on every poll anyway; the rev's only load-bearing job is CAS, but keeping it honest
costs one line.)

### D2 — Token-in-path bearer capability, exempt from session auth
The hub endpoint is `/api/notes/hub/{token}` where `{token}` is a generated
32-byte random value (base64url, ~43 chars). `PasswordAuthMiddleware` exempts the
`/api/notes/hub/` prefix; the handler itself rejects wrong tokens with a
constant-time comparison. This is the exact trust model the user already accepted
for the Apps Script `/exec` URL: whoever holds the link can read/write this one
board and nothing else. 256 bits is not brute-forceable, so bypassing the per-IP
throttle for this path is sound. The token never appears in logs (same rule as the
sync URL).

Wrong token / disabled hub answer HTTP 200 `{ ok:false, error:"…" }` — the client
already surfaces body errors verbatim in the sync bar, so a misconfigured remote
shows a human-readable reason instead of a permanent "offline".

### D3 — `ideas-hub.json` persists `{Enabled, Token, Rev}`
Atomic temp+rename write, never-reseed-on-unreadable load (house pattern). The
token is generated on first enable and kept thereafter (disable/enable does not
rotate it; rotation = delete the file, out of scope). Rev persists so CAS revisions
stay monotonic across hub restarts; a restart therefore never makes a client's
in-flight CAS falsely succeed.

### D4 — The pasteable URL is assembled client-side
The harness does not know its public hostname (`next5.birokrat.si` terminates at an
off-box IIS proxy). The browser does: the hub section renders
`window.location.origin + '/api/notes/hub/' + token` and offers copy. Whatever
origin the operator is browsing through is by construction reachable — no config.

### D5 — Serialization
Hub GET/POST handlers serialize under one lock (the Node/LockService equivalent),
making CAS check + merge + rev-bump atomic. Traffic is a handful of small requests
per poll interval; contention is irrelevant.

### D6 — Sync-URL scheme normalization
`IdeasSyncConfigStore.Update` prefixes `https://` when the pasted URL has no
scheme. `http://localhost…` (tests, LAN) still works by stating the scheme
explicitly.

## Risks / Trade-offs

- **Hub down = board frozen for others** — accepted; the sync layer already
  degrades to offline-with-retry, local boards keep working.
- **Public bearer URL on a public hostname** — same exposure class as the Apps
  Script URL the user accepted; revocation = disable hub (or delete
  `ideas-hub.json` to rotate the token).
- **A harness pointing its sync client at its own hub URL** — harmless no-op
  (merge with self; pushes bump the rev but raise no `Changed`, so no feedback
  loop), verified in e2e.
