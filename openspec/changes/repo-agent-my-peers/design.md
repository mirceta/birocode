# Design — repo-agent-my-peers

## D1 · One directory, read off caches

`ArchAgentService.PeerFleet()` composes the answer from what the arch already holds: the
registry and the agent snapshot for this machine (the non-blocking local views
`list_agents` uses), and each peer's cached describe for the fleet. Nothing on the path spawns
git or dials a machine, so the tool answers inside the agent's turn; the arch is never woken.
The tools service resolves the arch lazily through the service provider, keeping no
construction-time dependency.

## D2 · Machines and agents are two lists on purpose

A machine row carries every repo registered there, agents or not. That is what lets the agent
tell "prg is registered on MACHINE-B but has no dock" from "MACHINE-B does not have prg at
all" — the routing decision the Operator described. Agents are the docked / managed / running
repos, in the arch's own availability vocabulary with the claim reason appended.

## D3 · Same repo is decided by the remote, not the name

Two agents are the same repo when their normalized remote URLs match (scheme, user, `.git`
and `:`/`/` differences removed). Only when one side has no remote does the handle base
(`prg#2` → `prg`), then the name, decide. `handoffTarget` adds the arch's reach: managed on
its machine, the machine accepts fleet sends, this hub may send there.

## D4 · The detail sentence is the routing answer

The tool's detail names the same-repo agents with their availability, says NONE plainly with
the machines that lack the repo and what to ask the Operator, and restates the rule: a branch
goes to the same repo, a machine question to any agent on it, name the recipient.
