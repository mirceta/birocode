# Proposal: arch-loop-tools — the arch agent sets up, adjusts and stops loops on repo agents

## Why

The arch agent could only send one-off tasks (`send_task`, `dispatch_task`) to repo
agents. It could not arm a loop on one the way the Operator does from the agent's dock
Loop panel. The Operator wants to say "arch, set a goal loop on living room birocode:
goal <text>, cap 10" and have it done — on any machine in scope — and to see, edit and
stop such a loop on the dock exactly like their own. Fleet board task
`76ee2c866e83405683c440cfcb650b36` (Operator, 2026-09-06).

## What

1. **Four arch tools** on the same harness-tool surface as `send_task`:
   `list_loops(machine?, repoId?)` (every loop slot on the managed agents in scope: id,
   kind, goal/prompt head, recipe, pacing, cap, iterations, state, last/next fire,
   created by, stop reason), `start_loop(machine, repoId, kind, …)`,
   `update_loop(machine, repoId, loopId?, …, rearm?)` and `stop_loop(machine, repoId,
   loopId?)`. The parameter set is the Loop panel's and nothing more: kind suggestion ·
   recipe · goal · queue, mode suggest · drive, goal, recipe (id or name) or raw prompt +
   sentinel, maxIterations 1–100, the queue's tab + per-step verification, the
   footer-clauses opt-in. No new kinds; there is no interval — a drive loop fires when
   the agent is idle after each turn, and `list_loops` says so as `pacing`.
2. **Same rules and gates as sends.** Armed arch loop, autopilot gate open (the panel's
   own gate), repo managed and in scope, sends allowed to that machine and the peer's
   posture, not claimed unless `operatorAsked: "true"` (audited claimed-override). A busy
   agent may be armed — the panel arms over a running turn too. Every call is audited
   as an arch tool row with who (the tool's actor), what (kind · mode · cap · text
   head). Cross-machine through two new peer routes; a peer without them answers
   `no-peer-api`.
3. **The Operator drives it in the arch chat.** The role prompt (arch home `CLAUDE.md`,
   v5) gets a "Loops on repo agents" section: only when the Operator asks, report the
   loop id and effective parameters, never on the arch's own initiative, check
   `list_loops` on wakes and report escalations/caps. Loop transitions — armed, fired,
   escalated, capped, done, error, stopped — are published on the harness feed with the
   repo as source, and the wake composer narrates fired/escalated/capped/done/error/
   stopped for managed repos like it narrates turns (arming is not a wake).
4. **UI.** A loop knows who armed it (`armedBy`: operator | arch | arch@<machine>); the
   ungated loop projection carries it and the dock Loop panel shows "by arch" on the
   summary and the armed row. Editing and stopping work as before.
5. OpenSpec deltas for `arch-agent` and `autopilot-loops`, tool descriptions, tests.

## Non-goals

No new loop kinds, no autopilot-gate changes, the arch never starts a loop on its own
initiative (the prompt says so; every call is audited so the Operator can see if it did).
