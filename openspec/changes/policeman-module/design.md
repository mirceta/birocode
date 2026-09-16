# Design — the policeman module

## D1. One class per concern, named for the idea

The three levels a reader sees in the understanding app are the three classes: the lifecycle
(the agent's states and what moves them), the tools (what happens when the model calls one),
the prompt (what the model is asked to do). Constants and pure rules sit beside them in their
own small classes so a test can pin a rule without a service.

## D2. Dependency direction

`Policeman` → `Arch` interfaces, never the reverse. The arch service exposes `IArchConversationHost`
(the few things an add-on needs from it) and `IAgentDirectory` (the few things a tool needs
from the fleet), and consumes `IArchConversationHook`s. The arch has no policeman-named member
left; `DisallowedToolsFor` is the one static that mentions the policeman, because it is the
CLI fence and the fence's rule lives in `PolicemanToolPolicy`.

## D3. The cycle, made explicit

The policeman is an arch conversation, so it needs the arch; the arch runs the policeman's
turns, so it needs the policeman's hooks. The container resolves the hooks lazily
(`Lazy<IEnumerable<IArchConversationHook>>`) and the arch reads them only when ticking or
around a turn, never in its constructor. Registration: the arch module registers the host, the
directory and the lazy hook list; the policeman module registers its lifecycle as a hook and
its tools.

## D4. What stayed where it was

`BoardIntegrity` (the mechanical judge), `PrTrace` (PR → card), `CardObservations` (the
vocabulary), `TaskLifecycle` and the verifier are board concerns and stay in `TaskGraph`. The
policeman's persisted state stays in `ArchStateStore` (it is conversation bookkeeping), reading
its bounds from `PolicemanLifecycleRules`.

## D5. Tests

Existing tests keep their assertions with the names moved. New: `ReArmReason` (capped and done
at once, error after the cooldown, never over escalate / stopped), the six prompt steps and
their composition, the three fences from one policy, and `CardIsBehind`.
