# Design — repo-agent-arch-picture

## D1 · The picture is stated where the decision is made

An agent decides what to ask at the moment it reads the tool. So the picture lives in the
preamble's first sentences (`RepoAgentMcpServer.ArchPicture`, one constant, tested word by
word) and again, compressed, in the `request_arch` description — not only in a doc the agent
would have to know to fetch. `docs/agents.md` carries the long form, and `harness_help`
answers "what is the arch agent" with it, so an agent that wants more gets the same picture.

## D2 · Structure as optional fields, free text still the contract

`probe`, `ifFits`, `ifNone`, `meanwhile` are optional strings beside `text`; `text` stays
required and dedup still keys on it, so every existing caller and every existing request is
valid. The fields are rendered, never interpreted: the tab shows them as labelled rows, the
arch gets them as labelled lines with the one instruction that matters — a probe is something
to `send_task` to candidates and read back with `read_transcript`.

## D3 · One directory, read-only

`my_peers` is `ArchAgentService.PeerDirectory()`: the arch's own `ListAgents` (non-blocking,
off the agent snapshot and cached describes — a tool call never walks git) plus this harness's
docks outside the scope, named `unmanaged`. Send posture per machine comes from the peer's
describe (`acceptsSends`) and the Operator's allow-sends on the source. The tools service
resolves the arch lazily through the service provider, so it keeps no construction-time
dependency on the arch.

## D4 · "answered" without a new state

The harness already stamps every arch send to a local repo (`_archSentAt`, used by the
human-activity test). `my_requests` calls an approved request `answered` when that stamp is
newer than the delivery (or the decision, on a peer harness that only receives the decision).
No new store, no new event; a send after a still-pending request is not an answer to it.

## D5 · The reverse role is the same sentence everywhere

Preamble, tool text and doc all say the same thing about a probe: short, factual, checked now,
risk named, not executed. The acceptance check gives a fresh model the preamble and a probe and
reads what it would send back.
