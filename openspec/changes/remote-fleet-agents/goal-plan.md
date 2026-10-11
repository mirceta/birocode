# Goal plan — fleet agents on the sofa remote (size M)

Operator's ask, 2026-10-11. The sofa remote (`/remote`, openspec sofa-mode) lists only the agents of the
harness the phone is paired with. The phone now pairs with the **hub** (DESKTOP-POAPPP3) and the living-room
projector shows the hub's harness. Add the **fleet's agents**: list them grouped by machine (from the hub's
fleet status), write to any of them through a relay on the paired harness, and let the projector follow —
`open-agent` with a `sourceId` hops the big screen to that agent's own harness, logged in automatically with
a one-shot pairing PIN the hub mints on the peer through the relay; the hub relays the phone's commands and
heartbeats there so 🛋 / ▲ ▼ / zoom keep working. One repo (birocode), one branch
`feat/remote-fleet-agents`; **no PR until the hub has run the branch and it works** — the Operator is in the
loop once, at the end. The living-room repo needs nothing. Haydar talks to the hub only — unaffected.

## Steps (declare as the goal's plan)

1. **send** → living room/claude-web-this-app (the builder; it has the context and the end-to-end rig):
   build size M on `feat/remote-fleet-agents` —
   (a) `RemoteRelay`: allow-listed routes `/api/remote/relay/{sourceId}/{chat | stop | commands | screens |
   dock | sessions/{id}/messages | sessions/{id}/tools | pair/new}` forwarding to the peer's own API with the
   fleet credential the collector stores; nothing else proxied;
   (b) `/remote` lists machines + agents from `/api/arch/fleet/status` grouped by machine, dark machines
   greyed, tap → the composer writes through the relay; peek / questions / Stop through the relay;
   (c) `open-agent {sourceId, repoId}` for a peer → the hub mints a one-shot pairing PIN on that peer through
   the relay and sends the projector to the peer's `/remote?pin=…&then=/studio?agent=…&screen=<name>`;
   `/remote` learns to redeem `?pin=` and continue to `then`; from there the peer's page listens and the hub
   relays the phone's commands + heartbeats to it; a peer whose credential the hub lacks shows its login page
   and the phone says so;
   (d) tests: .NET for the relay allow-list and credential use, node for the remote model, an end-to-end on
   that machine with TWO isolated harnesses (one plays the hub, one the peer) — including the list-completeness
   check (every machine and agent of `/api/arch/fleet/status` appears on `/remote`);
   (e) commit and **push the branch — no PR**.
   *Done when:* the closing line `TASK COMMITTED … feat/remote-fleet-agents <commit>` and
   `origin/feat/remote-fleet-agents` is at that commit.
2. **verify** → the branch is on origin at the reported commit and its end-to-end script is in it.
   *Done when:* the commit is recorded.
3. **send** → the hub's birocode agent (resolve its handle from `list_agents`; repo birocode on
   DESKTOP-POAPPP3): switch the hub's repo to `feat/remote-fleet-agents` and build + run that build on the hub
   (the fleet-upgrade-to-a-branch path used for `feat/home-bridge-proxy` on 2026-10-11, or `swap.ps1` if its
   guard allows a branch — if it refuses, say so, never bypass it). Then the checks:
   - **list completeness** — run the branch's end-to-end on the hub (`.claudeweb-preview/sofa-remote-e2e.ps1`
     has the phone + projector rig) and confirm `/remote` lists every machine and agent of the hub's
     `/api/arch/fleet/status`, grouped by machine, dark machines greyed, none missing;
   - **the sofa** — pair the phone with the hub; tap living room's `pers-dec` → the projector hops to the
     living-room harness, logged in by the PIN (no access code typed); 🛋 and ▲ ▼ work there through the relay;
     a prompt sent from the phone streams on that harness; Stop stops it; peek shows the reply.
   A machine that does not answer the hub shows as a greyed group — correct, not a failure. A peer whose
   credential the hub lacks shows its login page — expected; note which.
   *Done when:* its report names each check as passed or failed, with what it saw.
4. **relay-loop** → every failed check goes back to living room/claude-web-this-app as a fix on the same
   branch (push, no PR); the hub agent pulls and re-tests. Repeat until all checks pass.
   *Done when:* the hub agent reports all green.
5. **send** → living room/claude-web-this-app: open the PR now, with the hub agent's test report in its body.
   *Done when:* `TASK PR … <url>`.
6. **human** → the Operator reviews and merges; then the arch brings the hub and the living-room harness
   back to merged `main` (the fleet upgrade). *Done when:* both report the new build in the fleet status.

## Rules

No PR before step 5. Do not touch the living-room repo. The hub stays on the branch only for the test —
step 6 returns it to main. Do not deploy the living-room harness while the Operator is using the projector
without saying so. The arch never merges.
