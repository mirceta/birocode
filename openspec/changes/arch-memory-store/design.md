# Design — arch-memory-store

## Where memory lives, who writes

| | before | after |
|---|---|---|
| storage | `arch-home/memory/*.md`, one machine, git-committed | `memory.json` in the **hub** harness's data dir; versioned entries |
| who sees it | nobody (only `recall`) | the Operator, on the Management **Memory** tab |
| writers | the arch (`remember`) | the Operator (tab: everything, incl. delete) and the arch (add / update / confirm / retire) |
| when the arch reads it | when it remembered to `recall` | **every turn**: principles + pinned always; knowledge by tag match |
| fleet | per-machine | the hub is the single writer; peers read `GET /api/memory` (replication = follow-up) |

## What a turn loads

```
cues = message text + conversation name + goal (id, text, names of its repos)
always    = active entries where kind = principle OR pinned        (clipped 600 chars each, 8 000 total)
knowledge = other active entries whose tag value (repo:prg → "prg") matches a cue as a WHOLE word   (≤ 6, 1 500 chars each)
→ "# Your memory" block → --append-system-prompt (not the message, so transcripts stay clean)
→ MarkUsed(always ∪ knowledge): lastUsed, lastUsedTurn, useCount; TurnSeq++
```

"Used recently" = `TurnSeq - lastUsedTurn < UsedWindowTurns` (default 20). STALE = `now - lastConfirmed >
StaleDays` (default 30). Both settings live in the store and are editable on the tab.

## Rules the store enforces

| rule | how |
|---|---|
| kind required | one of six; `Refused` otherwise |
| one-line reason | required on add / update / retire; ≤ 300 chars |
| no secrets | regex guard over title, body, tags and reason: GitHub / Anthropic / OpenAI / AWS / Slack / Google keys, private keys, JWTs, bearer tokens, connection strings with a password, URLs with credentials, `password=…` style assignments. "Where it lives" phrasing (`password: <ask>`, "in the Credential Manager") passes |
| no delete by the arch | `Delete` refuses any author but `operator`; there is no delete tool |
| history | every change snapshots the entry (≤ 50 versions kept) |
| durability | temp file + `File.Replace` with `.bak`; a zeroed / unreadable file loads the `.bak`, else is copied aside before anything overwrites it |

## Tools (MCP, role prompt v20)

| tool | args | note |
|---|---|---|
| `remember` | title, body, kind, **reason**, tags, id | id = update. Legacy `path`/`text` → updates the entry imported from that file |
| `recall` | query / id / kind / tag | none = compact index; marks returned entries used |
| `confirm_memory` | id | resets STALE |
| `retire_memory` | id, **reason** | stops loading; the Operator can restore or delete |

The author is `arch`, or `goal <id>` inside a running goal conversation. Goal progress belongs in the step plan
(`mark_step`); the role prompt says so.

## Import (first run, once)

`memory/*.md` from the home, read-only. Title is the first `#` heading, else the file name. Kind comes from the
name and content: `*rule*` / `feedback*` → rule; `fleet` / `tasks` → fleet-fact; a known repo name → repo-note;
"goal xxxxxxxx" → goal-note; otherwise other. Tags are `repo:` for registered repo names and `machine:` for this
machine and the collector sources found in the text. Dates come from `git log --follow` (first / last commit).
Every imported entry is `needsReview`. The two principles are seeded pinned, by operator.

## Evidence

- `tests/ClaudeWeb.Tests/MemoryStoreTests.cs` (14 facts / theories, 22 cases): reason / kind / title, 7 secret
  shapes refused, 3 "where it lives" phrasings accepted, versioning, operator-only delete, STALE, the turn
  selection (whole-word tags, retired never), edit then next turn, import + seed once, the zeroed file restored
  from `.bak`, search.
- `AgentProviderTests`: the block reaches `--append-system-prompt`.
- `memoryModel.test.mjs` (6).
- Lab (`.claudeweb-preview/memlab/lab.ps1`): an isolated harness on a copy of the arch home, 16/16. It imported
  22 files; a principle was edited in the tab; a **real arch turn** quoted the edited text; lastUsed and "used
  recently" were set; a secret was refused by the tab and by the API; the role prompt is v20; the real arch home
  was untouched.
