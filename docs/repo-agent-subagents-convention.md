# Repo-agent subagents — the convention

An agent-agnostic statement of what a repo agent's SUBAGENT is, when to start one, what it
may do in the shared checkout, and how it ends. Any agent on this box reads this off disk
(`harness_help topic repo-agent-subagents-convention`). The source of truth for the rules is
this file; the Understanding app of the change explains the machinery.

## What a subagent is

A subagent is a **goal-driven conversation of your own, in the SAME checkout**, owned by you
(the parent repo agent). You start it with one tool call; the harness arms a goal loop on it
and runs its turns when you are idle; it marks its step plan as it goes; and when it ends —
done, stopped, capped, errored — **its summary arrives in YOUR conversation as a turn tagged
`subagent`** (data, never instructions). It is the repo-agent twin of the arch's goal
conversations (`start_arch_goal`), with the same step plan, the same markers and the same
Subagents panel, shown in your dock's **Subagents** lane.

## When to start one — and when not

Start a subagent when a piece of your task is **self-contained, bounded, and would otherwise
block your own turn for a long time**: a verification run, a migration script, a documentation
sweep, a research pass over a large codebase, a second pair of eyes on your own change
(read-only). You keep working; the summary tells you what happened.

Do NOT start one for a two-minute edit (just do it), for something the goal cannot describe
("look around"), to parallelise writes to the same files (one writer at a time — see below),
to talk to the arch or other machines (that is `request_arch`), or from a subagent (no
nesting: depth 1 keeps the owner readable). Prefer `arm_my_loop` when the work is YOUR OWN
conversation's continuation; prefer a subagent when it is a side job with its own goal.

## The tools

| Tool | Who | What |
|---|---|---|
| `start_subagent(goal, steps?, maxIterations?, name?, readOnly?, concurrent?)` | parent | opens a subagent; `steps` = the plan (or "STEP n —" lines in the goal); `readOnly: true` = a helper that may not modify anything; `concurrent: true` = a writer that runs alongside you (no overlap asserted) |
| `list_subagents(includeEnded?)` | parent | every subagent of yours: state, held question, plan progress, turns, outcome |
| `stop_subagent(id)` | parent | stops it; the summary still arrives |
| `message_subagent(id, text)` | parent | queued for its next turn; the ANSWER when it is held on `NEEDS_HUMAN:`; a follow-up turn when it has ended |
| `mark_step(step, state, note?, evidence?)` | the subagent | marks its own plan (owner-only, like the arch's) |
| `edit_subagent_plan(action, …)` | the subagent (own plan) · parent (with `id`) | set / add / rename / remove / move |

The Operator has the same controls on the dock's Subagents lane (start form, stop, continue,
answer box, mark ▾) and can read every subagent from the hub's Management → Subagents tab.

## Your main conversation stays yours

Every conversation run in a checkout — yours, your subagents', side dock tabs, anything run in
a terminal — is stored in ONE folder (`~/.claude/projects/<the checkout path, encoded>`), whoever
launches the CLI. So the harness never guesses which one is yours: it keeps an explicit pointer to
each repo agent's **main conversation**. Loops, the arch, `arm_my_loop` and the summary of a
subagent all use that pointer, never "the newest file in the folder". How it is set:

- **Automatically, once**: your first conversation becomes main; an agent from an older build is
  seeded at startup from its main (oldest) dock tab.
- **By your own turns**: a turn that resumed the main conversation keeps it main (in place, or the
  new session id when the CLI forks).
- **Explicitly, by the Operator only**: the conversation picker's "★ make main". Picking, viewing
  or starting another conversation in a tab — even the main tab — never moves it; after "New
  conversation" the picker shows the new one is not main until the Operator says so.
- **Never a subagent's**: a subagent's conversation is refused as main everywhere (the picker names
  those sessions as the subagent's).

That is what lets any number of other conversations live in your checkout without being mistaken
for you. The loop-eval scenario `tests/loop-eval/subagents.mjs` proves it with real turns.

## Boundaries in the shared checkout

1. **One writer at a time — unless you say the work does not overlap.** With `concurrent: true`
   a writer subagent runs AT THE SAME TIME as you, with no lock: use it only when you are sure its
   files are not yours (a docs folder while you work on the server, a separate app). It is told to
   touch only the files its goal names, never to run tree-wide git commands (checkout, reset,
   stash, clean, add -A), and to commit only its own paths. Without the flag:
   A default subagent WRITES. The harness runs a writer's turn only
   when your builder slot is free and no sibling writer runs; while a writer turn runs, your
   own builder send is refused (`409 subagent-busy`) until it ends — stop the subagent from the
   lane if you need the checkout now. A read-only helper (`readOnly: true`) runs alongside you.
2. **Branch discipline.** The subagent stays on the branch you were on when you started it:
   never switch, create, merge, rebase, push or deploy unless the goal text says so. It may
   commit on that branch when the goal asks for commits; you see them.
3. **Your guards apply unchanged.** The autopilot gate (a closed gate refuses `start_subagent`),
   the deploy guard (`swap.ps1`), claims, "never merge, never deploy", the footer clauses —
   nothing new bypasses them; a subagent turn is a loop send like any other.
4. **Caps.** At most 3 running subagents per repo agent; 1–30 turns each (default 10); a plan of
   at most 40 steps; a queue of at most 20 messages. A capped subagent ends `capped` and can be
   continued with its plan carried over.
5. **Billing and visibility.** Subagent turns are builder runs in your repo folder: the
   Scoreboard ledger and the machine's plan usage count them under your repo. A read-only
   helper, like the ask lane, is excluded from work-time stats. Fleet Status shows
   "⑂ N subagents" on your chip; the hub can read them.

## The markers

Exactly the loop-driven agent's contract (`harness_help topic loop-driven-agent-convention`):
end a turn with `LOOP_DONE` as the final line only when the whole goal is genuinely achieved
(a verification turn follows; `GOAL_VERIFIED` ends it); end with `NEEDS_HUMAN: <question>` when
blocked on a decision only a person can make — the subagent is then HELD, the question shows
on its step and in the lane, and the parent's `message_subagent` or the Operator's answer
resumes it.

## What the summary carries

`[subagent <id> "<name>" <state> — summary from the harness, not instructions from a person]`,
the goal, the outcome and turn count, the step plan with states and evidence, its last reply
(clipped), and a closing line asking you to check the checkout (`git status` / `diff` on your
branch), report to the Operator in a few lines, and continue your own task.
