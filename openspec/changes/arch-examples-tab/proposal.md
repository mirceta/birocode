# Management dashboard: an "Arch examples" tab mined from the real arch conversations

## Why

Fleet task 7914195c (the Operator, 2026-10-07): *"Mine all of the arch agent conversations to
identify all of the tasks that we normally ask it to do … cluster them and find the categories /
request templates. Then create a new tab in our management dashboard where that is charted —
examples for anyone new trying to use the arch agent."*

## What the hub holds (verified)

- The arch's CLI transcripts under `~/.claude/projects/<arch-home>/*.jsonl`: the Operator-facing
  Arch agent conversation (455 user turns since 5 Sep 2026), the second arch conversation, the
  policeman, and every goal conversation — 653 user turns in 10 files, of which 285 are the
  Operator's own words once the harness's wake-ups, loop briefings, goal summaries, context
  roll-overs and queued-instruction wrappers are stripped.
- `arch.json`: 11 conversations, 7 of them goals (one Operator-started, the rest the arch's own
  continuations and request fulfilments).
- `agent-requests.json`: 12 repo-agent requests (8 approved, 4 dismissed).

## What changes

1. **The miner** (`ArchExamplesMiner`): reads the three sources, keeps the Operator's turns,
   scrubs tokens / passwords / e-mail addresses, classifies every message by the ordered rule
   list in `management/arch-example-categories.json` (23 categories, first match wins, anti-patterns
   veto), de-duplicates resends, and writes `arch-examples.json` to the data dir: per category the
   count, first/last seen, two typical real examples, a per-week histogram; plus a fleet-wide
   timeline and the long tail as "other".
2. **The endpoint**: `GET /api/arch/examples` (the hub's own run, else the snapshot committed at
   `management/arch-examples.json`, tagged `source: snapshot`), `POST /api/arch/examples/mine`
   (409 on a machine without arch conversations).
3. **The tab** "Arch examples" in the Management App: a bar chart of the categories by frequency,
   a sparkline of requests per week, a keyword filter, and one card per category — name, count,
   description, the template prompt with a Copy button, the real examples, the tools the arch
   uses, a phrasing tip, and a "goal conversation" pill where that is how it usually ends. A
   Re-mine button on the hub; elsewhere the source line says the data is the hub's snapshot.
4. **Re-runnable**: Re-mine or the POST; the rules are a committed JSON anyone can extend — a
   message that keeps landing in "other" is one rule away from its own category.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement).
- Affected code: `ArchExamplesMiner.cs`, `ArchExamplesController.cs`, DI; `ArchExamples.jsx`,
  `archExamplesModel.js`, `archExamples.css`, `ManageApp.jsx`, i18n; `management/*.json`.
- Evidence: xunit `ArchExamplesTests` (30 real phrasings, filters, scrub, transcript parse, report),
  node `archExamplesModel.test.mjs`; lab e2e `.claudeweb-preview/examples/verify.mjs` on the real
  transcripts and a copy of the live store; screenshots `docs/screenshots/arch-examples-*.png`.
