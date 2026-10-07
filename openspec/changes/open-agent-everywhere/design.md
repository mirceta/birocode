# Design — open-agent-everywhere

## D1 · Resolution in one place, with names for failure

Five surfaces built the same link five ways and each fell silent at a different point. The
shared opener owns the whole chain — machine from the fleet status (blank or `self` sourceId =
this machine), address from the peer registry, agent presence, reachability — and every stop on
that chain has a name the notice can say. "Unreachable" opens anyway: the address is known and
a login page is more useful than nothing; the line warns.

## D2 · The notice follows the click, not the tab

The opener announces on `window`; a single `OpenAgentNotice` renders the latest outcome wherever
it is mounted first — the Management App's root, so every tab shows it; the studio's Ideas page
mounts its own for the same boards there. Instances after the first render nothing, so a surface
may include it without doubling the line.

## D3 · Remembered fleet

A Task-graph node has no fleet prop; threading one through React Flow's node data is noise. Every
surface that polls `/api/arch/fleet/status` hands the answer to `rememberFleet`, and a caller
without one resolves against the latest. Before any poll landed the outcome is `no-fleet`, said
out loud.
