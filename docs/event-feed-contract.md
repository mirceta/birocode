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

Summary lives on the board; **details stay in your app**. The source row shows
your address, so the operator clicks through to your own UI for the full
picture.

## 4. Joining the fleet

On the Claude Web events-app page (Local tab -> Harness Event Feed): enter
`http://<machine>:<port>` and a label, plus the credential if you gate the
endpoint. The collector polls server-side and persists the source, so it keeps
listening across reloads and restarts.
