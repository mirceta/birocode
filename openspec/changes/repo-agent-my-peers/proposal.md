# my_peers — the fleet in front of the repo agent before it asks the arch

## Why

Fleet task d528046d, addendum (Operator-approved request from razvoj2016/prg, 2026-10-06). The
prg agent on RAZVOJ2016 wrote a real request — the LOCAL spike handoff — that probed "every
repo agent on another machine", although a branch handoff (pull prg branch
`feature/local-mode-revival`) can only go to a prg repo agent: a repo agent is bound to one
registered repo on one machine. It could not see whether any other prg agent existed in the
fleet, so it wrote "find someone" and widened the probe to every repo. Every arch request is a
routing decision — is there someone to ask, who, and is it the right kind. With the fleet in
front of it, the request becomes "ask prg on MACHINE-B this" or "no other prg agent exists; the
Operator must register prg on a machine with a Birokrat install". Landed first, ahead of the
rest of d528046d, as asked.

## What the code says (verified)

- The arch's `list_agents` view is `ArchAgentService.ListAgents` (managed local repos off the
  agent snapshot, managed fleet repos off each peer's cached describe) and `GET /api/arch/peer`
  (`PeerDescribe`) returns, per peer, its build, opt-ins, gate and EVERY registered repo with
  branch, dirty, availability, last actor, running since, managed, docked, handle. The hub
  caches it (`FleetClient.SnapshotNonBlocking`). No second directory is needed.
- The `claude-web` tool server (`RepoAgentMcpServer`) adds a tool as a catalogue entry, a
  dispatch arm and a toolbox method; its environment carries delegates the tools read.

## What changes

1. **`my_peers(repo?, sameRepoOnly?)`** — read-only, answered within the turn, never a wake:
   - per **machine**: label, harness reachable, `acceptsSends`, `sendsAllowed` (this hub may
     send), `gateOpen`, build (+ `olderBuild`), the repos registered there (name, handle,
     docked) — so "no prg agent on that machine" reads apart from "no agent there at all";
   - per **agent**: machine, repo name and handle, branch, dirty, availability (`available |
     busy | claimed | claimed (operator-occupied) | unmanaged | unreachable`), last actor,
     running since, managed; `sameRepo` when it is the caller's repo (same remote URL, else the
     same handle base, else the name) — the only valid handoff targets — and `handoffTarget`
     when the arch can actually reach it (managed, machine accepts sends, hub may send);
   - a dark peer is a row with its status and detail; an older build is marked; the answer's
     detail names the same-repo agents, the machines without the caller's repo, and says
     plainly when none exists.
   Source: `ArchAgentService.PeerFleet()` — this machine from the registry and the agent
   snapshot, every peer from its cached describe — resolved lazily by the tools service.
2. **One line** in the `request_arch` description and in the preamble: *"A peer is an agent
   bound to one repo on one machine. A branch or PR can only be handed to an agent of the same
   repo; a question about a machine can go to any agent on it. Read my_peers before writing a
   request, and name the recipient when you can."*

## Acceptance (as checked)

A fresh model given the tool text + preamble + a `my_peers` result with a prg agent on
MACHINE-B wrote a request addressed to that agent; given a fleet with no other prg agent it
asked the Operator to register prg on a named machine instead of asking the arch to search.
Transcripts in `acceptance.md`.
