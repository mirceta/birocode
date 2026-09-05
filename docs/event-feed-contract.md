# The event feed contract — how any app joins the fleet board

This is the **agent-agnostic** statement of the harness event feed's wire
contract: what a producer must serve so that Claude Web's event collector can
observe it. Any app on this network — another Claude Web harness, the
ClaudeMonitor app, or anything else that runs agents — becomes a fleet source
by implementing this one read-only endpoint. The collector then shows the
machine on the events-app primary page: its reachability, its **running
agents**, and its event log, with no changes to Claude Web at all.

The normative spec lives in `openspec/specs/harness-event-feed/spec.md` (and
the in-flight delta under `openspec/changes/`); this doc restates it for
implementers in other repos. If the contract changes, change the spec and this
doc together.

## 1. The endpoint

```
GET /api/events?after=<seq>
```

- `after` (optional, default `-1`): return only events with `seq > after`.
- Response `200 application/json`:

```json
{
  "events": [
    { "seq": 12, "at": 1751587340123, "type": "turn.start",
      "source": { "repoId": "api-chatbot", "repoName": "api-chatbot" },
      "data": { "turnId": "4804f50b2d77...", "sessionId": null } }
  ],
  "lastSeq": 12
}
```

- The endpoint is **read-only** and side-effect free. The collector only ever
  GETs it; it never writes to a source.
- Auth is optional. If you gate it, accept the credential in the
  `X-Auth-Password` header (that is what the collector sends when the operator
  stores one). `401` means "needs credential", `403` means "IP refused",
  `429` means "throttled" -- the collector renders each distinctly.

## 2. The envelope (stable; `type` is the extension point)

| field  | meaning |
|--------|---------|
| `seq`  | integer, strictly increasing for the process lifetime; survives trims |
| `at`   | unix milliseconds |
| `type` | event kind string, e.g. `turn.start` |
| `source` | where in the producer it originated; include `repoId`/`repoName` (or your app/context name) when applicable |
| `data` | payload object, shape determined by `type` |

Feed semantics: append-only, bounded ring (Claude Web caps at 1000 and trims
the oldest 200 at a time); `seq` keeps climbing past trims. In-memory only is
fine -- the feed need not survive a restart.

## 3. The two turn events (what lights up "running agents")

- **`turn.start`** -- publish when a run/turn launches. `data` MUST include a
  fresh unique `turnId` (a GUID string); include `sessionId` when resuming.
- **`turn.ended`** -- publish once per turn at ANY terminal state (success,
  error, cancellation). `data` MUST echo the same `turnId` and SHOULD include
  `status` (`"done"` or `"error"`) plus whatever details you have
  (`sessionId`, cost, turns).

Both publishes must be **best-effort**: a failure to publish must never
disrupt the run itself.

The board pairs `turn.start`/`turn.ended` by `turnId` per source: an unmatched
start renders as a running agent (labelled by `source.repoName`, with elapsed
time); unmatched starts older than 4 hours are dropped, so a lost `turn.ended`
cannot pin a ghost agent. A producer that emits only `turn.ended` still gets
its event log and reachability -- it just shows no running agents.

### Other types Claude Web publishes

- **`chat.focus`** -- someone clicked into a dock's chat box (`source` = the
  repo). Informational; no pairing.
- **`arch.wake`** -- the arch agent (openspec `add-arch-agent`) was woken by
  the feed and sent a wake-up turn. `source` is `{ repoId: "@arch", repoName:
  "Arch agent" }`; `data` carries `after` and `upTo` (the collector seq range
  the wake covered), `repoIds` (the managed repos named) and `sessionId`. A
  consumer that does not know the type falls back to its default cue -- the
  host sound does exactly that.

Summary lives on the board; **details stay in your app**. The source row shows
your address, so the operator clicks through to your own UI for the full
picture.

## 4. Joining the fleet

On the Claude Web events-app page (Local tab -> Harness Event Feed): enter
`http://<machine>:<port>` and a label, plus the credential if you gate the
endpoint. The collector polls server-side and persists the source, so it keeps
listening across reloads and restarts.

## 5. The fleet peer API — being *commanded*, not just watched

The feed is how a harness is **observed**. The peer API (openspec
`add-fleet-arch-agent`) is how a **fleet arch agent** on another Claude Web
harness gives one of your repo agents a task. It is optional, off by default,
and separate from the feed on purpose: the collector never writes to a source;
a sibling *fleet client* on the calling harness does, and only for sources its
operator marked **allow sends**.

```
GET  /api/arch/peer
  -> { "protocol": 1, "version": "<build>", "machine": "<label>",
       "acceptsSends": false, "acceptsUpgrades": false, "gateOpen": true,
       "managedRepoIds": [ "<repoId>", … ],          # this harness's OWN arch scope
       "repos": [ { "repoId", "name", "remoteUrl", "branch", "defaultBranch",
                    "dirty", "availability", "lastActor", "runningSince",
                    "exists", "isSelf", "managed" } ] }

POST /api/arch/peer/send        { "repoId", "text", "branch"?, "from": "<caller's label>" }
  -> { "ok", "status", "detail", "data" }
     status: sent | busy | claimed | denied | not-accepting | unmanaged | error

  `unmanaged` also means "not in this harness's own arch scope": the receiving
  harness's Arch tab decides which of its repos a fleet arch may task, and the
  describe carries that (`managed` per repo, `managedRepoIds`). A caller reads it
  before sending; a peer on an older build omits `managed`, and callers treat
  that as not sendable ("upgrade it").

GET  /api/arch/peer/transcript?repoId=<id>&tail=<n>
  -> { "ok", "status", "detail", "data": { "messages": [ { role, text, at } ] } }

POST /api/arch/peer/upgrade     { "ref"?: "main", "from": "<caller's label>" }
  -> { "ok", "status", "detail", "data": <job> }
     status: started | busy | current | not-accepting | not-on-branch | dirty | pull-failed | error

GET  /api/arch/peer/upgrade/<jobId>
  -> { "ok", "status": deploying | done | rolled-back | failed, "detail", "data": <job> }
```

- Same auth as the feed: the `X-Auth-Password` header. The credential the
  caller's collector already stores for your feed is what it uses here.
- **Two opt-ins.** The caller's operator must allow sends *to you* (per source);
  your operator must set **accept fleet sends** on your Arch tab (and your
  autopilot gate must be open). Until both hold, `send` answers
  `not-accepting` and runs nothing.
- **Your rules apply.** A received task passes *your*
  availability rule (a repo on an operator branch is `claimed`) and *your* run
  slot (`busy` is an answer, never a queue). Nothing is stashed.
- **Honest provenance.** The task lands in the repo agent's own dock
  conversation as a user bubble tagged `arch@<from>`, and *you* write the audit
  row (kind `arch`, phase `fleet:<from>`), so the tag survives a reload without
  trusting the wire. The caller cannot make a task look human.
- **Versioning.** `protocol` is the peer contract (1 today); `version` is your
  build. A harness without this route answers 404, which the caller shows as
  "no peer API on that build" — the mismatch is visible before anyone upgrades.
- Every logical outcome is a `200` with a named `status`; HTTP errors mean
  transport or auth, so the caller can tell "refused" from "dark".

### 5.1 Fleet upgrades — a peer redeploying *itself* on request

`upgrade` (openspec `arch-peer-upgrades`) is the same shape as `send` with a
different verb: a fleet arch that sees you on an older build than its hub asks
you to bring yourself to a ref. It is off by default (**accept fleet upgrades**
on your Arch tab, plus the open gate) and nothing in it bypasses your own deploy
rules:

- **Your checkout, your branch.** The receiver only ever fast-forwards the
  branch it is already on (`main` unless the caller names another). On a
  different branch → `not-on-branch`; uncommitted changes → `dirty`;
  a non-fast-forward → `pull-failed`; already at that commit → `current`.
  Every refusal leaves the tree exactly as it was.
- **Your deploy script.** It runs the committed `swap.ps1` detached — origin/main
  guard, stage-before-stop, preserved `logs/` + `appsettings.json`, and the
  15-minute dead-man switch. Template-declared keys missing from the preserved
  `appsettings.json` are carried in first, with the template's value.
- **Keep is earned, not assumed.** The job file outlives the restart; the new
  process finds it, and only if it *is* the target commit does it disarm the
  rollback (`done`). Otherwise the switch restores last-good (`rolled-back`)
  or the deploy log shows the abort (`failed`).
- **One at a time**, `busy` while a job is deploying; the caller reads your new
  `version` from the describe on a later wake instead of polling.
