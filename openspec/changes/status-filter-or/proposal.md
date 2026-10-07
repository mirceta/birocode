# Status → Agents: the filter box takes several patterns (OR)

## Why

Fleet task ca7d22b8 (the Operator, 2026-10-07): the Fleet Status tab's agent filter matched a
single substring only. With 9 machines and ~50 agents that box is the main way to narrow the
list, and the Operator wanted "every agent whose name contains prg OR webflow" at once — and
typed `*prg*` while trying.

## What the code says (verified)

- The matcher is one pure module, `client/src/manage/agentQuery.js` (`matchesAgentQuery`):
  case-insensitive substring over the agent's name, handle, visible label, branch, remote URL
  and machine; whitespace-separated words AND. `FleetStatus.jsx` applies it once, in `scoped`,
  and everything downstream — the machine blocks, the chips, the "n of m" count, the state
  chips' counts, split / merged and the running view — reads from that one list, so changing
  the helper changes every view consistently. The machine filter is chips, not text, so there
  is no second text matcher to reuse.
- The box's value persists per browser (`manageapp.fleetFilters` → `q`) as a plain string.

## What changes

1. **OR syntax** in the one helper: patterns separated by `|` or `,` are alternatives; whitespace
   around separators is ignored; an empty alternative is absent; inside a pattern words still
   AND; a single pattern behaves exactly as before. `*` inside a word is a wildcard (`*prg*` =
   `prg`). A word typed without separators still finds the separated name (`webflow` matches
   `web-flow-autodev1`) — the plain substring is tried first, the separator-stripped form only
   when it misses, so nothing that matched before stops matching.
2. **The hint**: placeholder "Search name, branch, URL, machine… (prg | webflow = either)", a
   tooltip, and a small hint beside the box ("a | b or a, b = either · * = any · webflow finds
   web-flow").
3. **Persistence** unchanged by construction — the same string, so the new syntax restores
   exactly as typed.

## Verification

- node `agentQuery.test.mjs` +5 (OR with `|` and `,`, whitespace, empty alternatives; the single
  pattern unchanged incl. AND and blank input; the wildcard incl. regex specials; the
  separator-insensitive fallback; the parser) — 10/10.
- `shot-status-filter-or.mjs` over the REAL fleet snapshot of this hub
  (`client/tests/ui/fixtures/fleet-status-live.json`, captured from `GET /api/arch/fleet/status`
  on 2026-10-07: 2 machines, 15 agents incl. `prg` and `web-flow-autodev1`): before = "Nothing
  matches" for `prg | webflow`; after = both kinds listed, the count equals the chips, `,` and
  `*prg*` and spacing behave as specified, the value survives a reload.
