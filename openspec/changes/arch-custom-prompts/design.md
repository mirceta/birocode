# Design: arch-custom-prompts

## D1 — Generalise the store, do not fork it

`PromptsService.Prompt` becomes `(Id, Emoji, Label, Text, Owner?, Category?, Hint?, SeedId?,
Edited, CreatedAt)` with the new fields optional and defaulted, so the existing
`prompts.json` loads unchanged and every existing call (`List()`, `Add(emoji, label, text)`,
`Update(id, emoji, label, text)`, `Delete(id)`) keeps its meaning: owner-less prompts are the
repo agents' library. `List(owner)` filters by owner; `Reorder(owner, ids)` reorders within an
owner and leaves the others in place; `Duplicate(id)` inserts a copy (no seed id) right after
the original; `Seed(owner, seeds)` adds every seed whose `SeedId` is absent and never changes
a present one. `Update` marks a seeded prompt `Edited` when its text or label changes.

The suggestion loop's routines (`AutopilotService` → `PromptClassifier.BuildRoutines(_prompts.List(), …)`)
and the discovery service read `List()` — chat prompts only — so arch prompts never become
repo-agent routines.

## D2 — Seeds: curated first, converted second

`ArchPromptSeeds` holds one curated prompt per mined category (id = the category id from
`management/arch-example-categories.json`): the template folded with the Operator's own
phrasing and `{placeholders}`, grouped into six panel groups (Deploy & fleet · Cards & board ·
Agents · Loops, goals & recurring · Files · Ask & nudge), plus a few the brief named that are
not a mined category (`run-goal`, `agents-table`). `FromExamples(doc)` adds a converted prompt
for any category in the examples document the curated set does not know (`<machine>` →
`{machine}`, `<repo>` → `{agent}`, `<id>` → `{task}`, `<n>` → `{pr}`, `<git URL>` → `{url}`,
anything else → `{text}`); `WithTips` fills each seed's hint from the document's "how to phrase
it". `POST /api/prompts/seed/arch` uses `ArchExamplesMiner.Current()` — this hub's mining run or
the committed snapshot — so a machine without arch conversations seeds the same catalogue.

## D3 — The panel and the chips are the arch conversation's, not a modal

`ArchPromptsPanel.jsx` sits between the transcript and the composer in `Arch.jsx` (chat view;
it therefore appears in the harness's Arch tab, the Management App's Arch agent tab and the
Subagents tab's conversation view). Insert appends to the draft with the repo agents' contract
(blank-line separated, nothing lost, nothing auto-sent); ▶ send calls the page's `send(text)`
(a turn without touching the draft; hidden while a busy goal queues instead). First use: an
empty arch library triggers one seed call. `PlaceholderChips.jsx` derives the chips from the
DRAFT (`placeholdersOf`), fills by replacing every occurrence (`fillPlaceholder`), and offers
pick lists from the arch state (`optionsFor`): machines = the hub + the fleet sources, agents
= the handles, branches = the agents' branches, cards = the task graph (fetched when a
`{task}` chip appears). Pure rules in `archPrompts.js`, node-tested. The feature is gated by
the `archPrompts` capability (advanced, per the UI-modes convention).

## D4 — Tools

`cache_prompt` refuses nothing but duplicates (same text → `exists`), defaults the category to
Ask & nudge, audits like every arch tool; `list_cached_prompts` is read-only;
`remove_cached_prompt` accepts a unique id prefix. The role prompt (v18) teaches the
Operator's-ask rule and the placeholder vocabulary. 40 tools in the catalogue.
