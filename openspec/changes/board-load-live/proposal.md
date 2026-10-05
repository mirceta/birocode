# The management board's load time on the live hub

Fleet task `1a17afbe36a1453886de05ed90391391` (Operator, 2026-10-05). After PR #137 (log path)
and PR #140 (agent snapshot, dead-peer backoff) were deployed on the hub (`4c80b675`), the
Operator still saw a very slow management board, and asked for the cause to be found on the
live hub with the real data — not in a fixture.

## How it was measured

- **On the live process**: a read-only tracer (`tools/livetrace`) attached to the running hub
  over the .NET diagnostics channel and recorded every request Kestrel served for 245 s under
  the Operator's real browsers (2,005 requests, 8.2/s), plus `dotnet-stack` samples of the
  request threads, plus the hub's own log since the deploy.
- **In a real browser**: headless Chromium against the same build over a same-minute copy of
  the live store (the real 85 cards, 15 docks, 31 fleet agents, all 6 real peers polled
  read-only), recording the full network waterfall. A browser session on the live hub itself
  needs the Operator's login, which an agent does not hold and must not forge.

## What it showed

1. **The Kanban waited for the fleet status before painting anything.** `/api/taskgraph`
   answers in 2–40 ms, but the board awaited `Promise.all([taskgraph, fleet status, ideas])`.
   Live, `GET /api/arch/fleet/status` took **p50 547 ms, p95 4.5 s, max 5.6 s**.
2. **Fleet status spawned a process on every poll.** Its overview read the keep-alive
   watchdog with `schtasks /query` inline; a process spawn costs 30 ms to several seconds on
   the hub. The lab never showed it because the lab box was idle.
3. **After a restart the board hung for the length of the first snapshot pass** (5–75 s on
   the hub; over 90 s in the browser run): a request that found no snapshot waited for the
   worker's pass — and since PR #140 every later poll of that URL *joined the hung request*.
4. **`GET /api/arch/claim` — the Dashboard's per-dock badge — was 67 % of all server time**:
   166 calls in 245 s, p95 **10 s**, max 15 s; it ran a full git status on the request thread.
   `GET /api/arch` still stalled 1–3 s when its 15 s home-commit cache missed (a git spawn).
5. **A git status was 9–11 processes**; the snapshot worker's pass over 15 repos took
   17 s on average and up to 75 s live.
6. **Nothing was compressed and the Management App was never cached**: 1.67 MB of JS + CSS
   re-downloaded and re-compiled on every load (`no-store`), a 295 KB board every 5 s —
   3.8 MB a minute per open Kanban.
7. **Not a cause**: rendering. Script + layout for the real board is ~0.2 s; only the visible
   cards are in the DOM.

## What changes

- The Kanban paints on `/taskgraph` alone; machine labels and idea numbers fill in.
- The watchdog probe is cached (15 s, renewed in the background, invalidated by the installer).
- No snapshot yet → a provisional one built without git, never a wait.
- `claim` and the home commits read cached state and never run git on the request thread.
- A git status is at most 5 processes (one `for-each-ref`, one `config --get-regexp`).
- Brotli/gzip on JSON, JS, CSS, HTML (never on event streams); the Management App's
  content-hashed files are `private, immutable`.
- A poll joins an in-flight request only while it is younger than 4 s.
- `tools/livetrace` is committed so the same live measurement can be repeated after a deploy.
