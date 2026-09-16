# Goal app per repo agent — "Update goal" + Auto, a mirror of "Ask for understanding"

> **STATUS: DRAFT — design-clarification pass (fleet task f7224e55).** Not an implementation.
> The understanding of the existing feature and the proposed mirror are rendered in
> `understanding-app/` (tabs 1–5); the open decisions are listed at the end and must be
> answered before design.md / tasks.md / delta specs are written.

## Why

Each repo agent already has a companion the Operator can refresh on demand or after every
turn: the **Understanding app** ("Ask for understanding" + Auto). It explains the latest
reply. What is missing is the same shape for the **goal** of what is being built in that
repo: a stated goal, kept current, visible at a glance, refreshed by a subagent that reads
the conversation — so "what are we building here, and where are we against it" is never
buried in a long chat.

## What exists today (investigated, on main)

```
🧠 PinnedAgent.jsx button (capability understandingAgent, Advanced; enabled with a builder sessionId)
   → POST /api/understanding/ask {repoId, sessionId}            UnderstandingController (start-or-join)
   → UnderstandingJobs (one backend job per repo, own token, latest-only, Console op=understanding, audit)
   → UnderstandingAsk (transcript via SessionService → pasted ≤12k / exported; convention doc resolved by absolute path)
   → AgentHelperRunner (EPHEMERAL run on the repo's engine, cwd = repo root, writes files; live session untouched)
   → understanding-app/index.html (+ assets) at the repo root, per docs/understanding-app-convention.md
   → served no-store as the synthetic kind:harness app "understanding" (RepositoryRegistry.ToInfo → LocalProxyController → UnderstandingApp/HarnessStaticApp)
☑ Auto = RepositoryConfig.AutoUnderstanding (persisted, default off; GET/POST /api/understanding/auto)
   → AutoUnderstandingTrigger (hosted) on RunSessionService.RunCompleted: builder + done + sessionId + flag
   → UnderstandingJobs.EnqueueLatest: idle → start; running → ONE pending slot (coalesce, never queue); the finishing run chains it
```

## What changes (proposed)

1. **A Goal app per repo agent**, built by the same convention: `goal-app/` at the repo root
   (`goal.json` = the machine-readable goal: text, acceptance, setAt, setBy, revisions[];
   `index.html` = the visualisation), served as a second synthetic harness app `goal`
   at `/api/localview/{repo}/app/goal/`.
2. **"Update goal"** in the dock, right next to "Ask for understanding": the same
   start-or-join / status / Console / audit shape, running a subagent that is given the
   transcript AND the current goal, and decides SET / REVISED / UNCHANGED — rewriting
   `goal-app/` only on SET / REVISED, answering "goal unchanged" otherwise.
3. **Set the goal from chat**: the Operator states it in the agent's chat; the next
   Update-goal run (manual or Auto) records it. Optionally (decision Q3) a repo-agent
   harness tool records it at once — on the tool server PR #115 introduced, not a new one.
4. **Auto** — a per-repo persisted `AutoGoal` flag and the identical post-turn hook.
5. **One infrastructure**: the existing `UnderstandingJobs` / `UnderstandingAsk` /
   `AutoUnderstandingTrigger` become a `Companion*` family parameterised by kind
   (`understanding` | `goal`: folder, flag, Console op, audit name, prompt, capability);
   `UnderstandingApp` stays `HarnessStaticApp` with another folder. Behaviour of the
   understanding feature is unchanged (its tests pin it).

## Open decisions (answer in chat; rendered with options + recommendations in the Understanding app, tab 5)

- **Q1 Goal storage** — in the repo (`goal-app/goal.json`, recommended) · server-side per repo · on the board card.
- **Q2 One goal or history** — one current goal + an append-only revision list (recommended) · overwrite only · several concurrent goals.
- **Q3 Detecting "set a goal from chat"** — the subagent reads and decides (recommended base) + a `set_goal` tool on the repo-agent MCP server (PR #115) · a literal trigger phrase (not recommended).
- **Q4 Nothing changed** — write nothing, Console "goal unchanged", the app shows "last checked N ago" (recommended) · always rebuild.
- **Q5 Auto cost** — an independent flag, two paid runs per turn when both Autos are on (recommended now) · a read-only pre-check before building · gated on the understanding run.
- **Q6 Board goal / arch goals** — independent for this change (recommended); seed from the dispatched card?; expose per-agent goals to the arch/policeman (follow-up).
- **Q7 Where served** — a sibling harness app `goal` (recommended) · a tab inside the Understanding app · a dock panel above the chat.
- **Q8 Parameterise vs copy** — parameterise the existing classes by kind (recommended) · copy them.
- **Q9 Goal visible in the chat** — not in the first slice (recommended); a one-line "🎯 goal:" later.
- **Q10 Which turns count for Auto** — exactly the understanding rule (builder, done, session id, flag) (recommended); also the ask lane?

## Composition

- `ask-for-understanding` (archived changes add-ask-for-understanding, auto-understanding-after-turn): the family this generalises; no behaviour change.
- `cross-repo-effort-legs` (PR #115): the repo-agent tool server where `set_goal` / `my_goal` would live; `my_effort` already lists the cards an agent is a leg of, which the Goal app can link.
- The fleet board goal (`kanban-board-integrity`) and arch goal conversations are different "goal" words — kept separate unless Q6 decides otherwise.
- `docs/understanding-app-convention.md` needs a folder-parameterised form (or a short goal-app addendum) so the same four-line contract governs `goal-app/`.

## Impact (estimate, once decided)

Backend: `Services/Understanding` → `Services/Companion` (kind-parameterised jobs / ask / trigger / controller), `RepositoryConfig.AutoGoal`, `RepositoryRegistry.GoalAppId` + synthetic app + `LocalProxyController` dispatch, the goal prompt, optionally `RepoAgentToolbox.SetGoal`. Client: a second row in `PinnedAgent.jsx`, capability `goalAgent`, i18n. Tests mirror the understanding ones (`UnderstandingJobs`, trigger, controller) per kind, plus goal.json parsing and the SET / REVISED / UNCHANGED outcomes.
