# Design: remote-fleet-agents

## Facts (read 2026-10-10)

- The phone is one session on one origin: `POST /api/remote/pair {pin}` mints the same cookie
  `/api/auth/login` does, for the harness that minted the PIN. Nothing on the phone can call a
  peer's API.
- The hub already authenticates to every peer: `CollectorService.BuildPeerRequest(sourceId,
  method, path)` builds the request with the stored credential as `X-Auth-Password`; the fleet
  client uses it for `/api/arch/peer`, `/api/arch/fleet/send`, upgrades. `ScrubFor` blanks the
  credential in surfaced text **and caps it at 200 chars** (it is for one-line reasons).
- `GET /api/arch/fleet/status` → `{ machines: [{ machine, sourceId, self, address, reachable,
  status, agents: [{ key, repoId, name, docked, exists, availability, runningSince, unseenResult,
  … }] }] }`, from the 10-s non-blocking snapshot. Self's agents carry `tabId`; a peer's do not.
- A peer's `tabId`/`sessionId` for a repo come from its own `GET /api/dock`.
- The big-screen listener keeps its last `seq` in **sessionStorage** — per origin, per tab. A tab
  that leaves for another origin and comes back continues from the seq it had there; on a new
  origin it starts at `-1` (no replay). A screen's heartbeat lingers **20 s** after the tab left
  (`RemoteCommandStore.ScreenTtl`).
- `/studio?agent=<id>&screen=<name>` is the deep link the Kanban chip and `open-agent` already
  use; `?screen=` forces the listener on and is remembered per origin.

## D1 — Where the relay lives, and what it relays

A `RemoteRelay` service beside `RemoteCommandStore`, and two routes on `RemoteController`:
`GET|POST /api/remote/relay/{sourceId}/{**path}`. The path is matched against a fixed
allow-list (`RemoteRelay.AllowList`, method + regex, without the `/api/` prefix):

| route | method | send? | why the remote needs it |
|---|---|---|---|
| `dock` | GET | no | the peer's tabs → session ids, status |
| `sessions/{id}/messages`, `sessions/{id}/tools` | GET | no | peek, the open question |
| `remote/screens` | GET | no | "projector is showing …" while the screen is on the peer |
| `remote/commands` | POST | no | a command for a screen that listens on the peer |
| `remote/pair/new` | POST | no | the one-shot PIN for the projector's hop |
| `chat` | POST | **yes** | write to the peer's agent |
| `chat/stop` | POST | **yes** | stop it |

Anything else is 404 *here* (`not relayed`). `X-Repo-Id` and the query string ride along. For
`chat` — which answers with the run's SSE stream — only the status line is read (the run is
detached on the peer) and `{ ok: true }` is returned; a 409 (busy) body is relayed. Bodies are
scrubbed with a new `CollectorService.ScrubBody` (credential blanked, **no cap** — the cap of
`ScrubFor` cut the first relayed dock at 200 bytes). A peer that does not answer → 502
`peer unreachable`. "Send" routes require the source's **allow sends** switch (the one the arch's
`send_task` honours) — 403 with the Fleet-tab hint otherwise.

Rejected: a generic `/api/proxy/<sourceId>/**`. The whole point of the fleet client's design is
that the hub's credential for a peer is used by named code paths, not by whatever the browser
asks for.

## D2 — The command plan: one POST, routed by where the screen is

The phone keeps posting every command to `POST /api/remote/commands` on the hub, now with
`screenOn` (`"self"` or a peer's sourceId — where the phone believes the big screen is) and
`screen` (the screen's name, default `projector`). `RemoteRelay.PlanCommand` (pure, tested)
decides:

- any command, screen here → the hub's own queue, untouched (the sofa-mode path);
- any command, screen on peer P → forwarded to P's `POST /api/remote/commands` (relay);
- `open-agent {sourceId: P, repoId}` → a **`navigate`** `{ url: <P's address>/remote?pin=<one-shot
  PIN minted on P>&then=/studio?agent=<repoId>&screen=<name> }`, enqueued where the screen is
  (here, or forwarded to the peer it is on). No credential for P → `then` alone (P's login page,
  honestly), and the reply carries a `note` the phone shows;
- `open-agent {repoId}` (a hub agent) while the screen is on a peer → `navigate` to the hub's
  `/studio?agent=…&screen=…`, forwarded to that peer;
- `navigate {}` from the phone → **home** (`/studio?screen=…`), forwarded to the peer; a
  `navigate` **with** a url is one a hub planned and forwarded — enqueued as it is (this is how a
  peer takes the hub's navigate instead of re-planning it as "already home").

`navigate` is a new command type on both sides: the client dispatcher does
`location.assign(url)` for http(s) URLs only.

## D3 — The hop logs the big screen in with a one-shot PIN

The peer's `/remote` learns `?pin=&then=`: the pairing screen redeems the PIN at once (no
typing), then `location.replace(then)`. `then` must be a same-origin path (`/…`, not `//…`);
anything else falls back to `/studio`. Already logged in there (`/api/auth/check` says so) →
straight to `then`. The PIN is the ordinary pairing PIN — 6 digits, 5 minutes, single use, the
same cookie a login mints — minted by the hub through the relay (`remote/pair/new`), which the
peer's gate accepts because the hub sends the peer's own password. Nothing new is invented on
the auth side; a projector browser that hops ends up paired with the peer the way a phone would.

## D4 — The phone's belief about the screen, and the stale heartbeat

The phone stores `screenOn` (sessionStorage) and sets it when it sends the screen somewhere.
It polls the hub's screens always, and the peer's screens (relay) when it believes the screen is
there; the header shows `<machine> · <screen> · <what>`. `followScreen` (pure) corrects the
belief from evidence: the peer shows a screen → there; the peer shows none and the hub does → it
came home. **Except right after a hop**: for 20 s the hub still lists the tab that just left,
and the peer has not loaded yet — so until the peer has been seen once (or 30 s passed), "home
and not there" is not evidence. Without this the second poll after every hop flipped the belief
back and every later command went to the wrong queue (seen in the first e2e run).

## D5 — The list

`fleetGroups(fleetStatus, dock)` (pure): this harness from its **dock** (live status, session,
colour), then each peer from the fleet status — its `docked` agents, badge from `availability ===
busy` / `unseenResult`. A machine with `reachable: false` is kept, its buttons disabled and
greyed, headed "dark". No fleet status (an older harness, an error) → this harness alone, as
before. The peer group's agents equal the peer's own dock — the hub agent's **list-completeness**
check in the goal plan, and the e2e's.

## D6 — Views while away

The views row (Kanban, Status, Arch, Fleet) is the **hub's**. A view tapped while the screen is
on a peer first posts `navigate {}` (home) and then `open-view`, to the hub's queue. The
returning tab continues from the seq it had at the hub (sessionStorage per origin) and catches
the `open-view` up. Rejected: showing the peer's Kanban — the board, the arch and the fleet live
on the hub.

## D7 — What the hub agent must have for the real test

- The living room registered as a collector source on the hub **with its password** (the fleet
  credential) — the relay reuses it; without it the hop shows the peer's login page.
- **Allow sends** on for that source (Fleet tab) — or writes and stops answer 403 with the hint.
- The peer's **address as registered on the hub must be reachable from the projector PC**: the
  projector browser is sent to that very URL.
