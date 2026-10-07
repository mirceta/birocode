## 1. Build

- [x] 1.1 `PromptsService`: owner / category / hint / seedId / edited on the record (old files
      load as chat prompts), `List(owner)`, `Reorder`, `Duplicate`, `Seed`; `Update` marks edits.
- [x] 1.2 `ArchPromptSeeds`: the curated seed per mined category with placeholders and groups;
      `FromExamples` converts unknown categories; `WithTips` reads the hints.
- [x] 1.3 `PromptsController`: `?owner=`, owner/category/hint on create and edit, `reorder`,
      `{id}/duplicate`, `seed/arch` (through `ArchExamplesMiner.Current()`).
- [x] 1.4 Arch tools `cache_prompt` / `list_cached_prompts` / `remove_cached_prompt`
      (`ArchAgentService.Prompts.cs`, the MCP catalogue, 40 tools); role prompt v18 "Cached prompts".
- [x] 1.5 Client: `archPrompts.js` (pure), `ArchPromptsPanel.jsx`, `PlaceholderChips.jsx`,
      `archPrompts.css`; `Arch.jsx` hosts the panel above the composer and the chips inside it,
      `send(text)` for ▶; `archPrompts` capability (advanced); both bundles rebuilt.

## 2. Verify

- [x] 2.1 `ArchCachedPromptsTests` (5): owner separation + persistence, seeding is additive and
      edit-safe, reorder / duplicate per owner, the seed table covers every mined category and
      converts unknown templates, the tools + role prompt. Pins updated (40 tools, order, v18).
      Full suite: 906 green.
- [x] 2.2 `archPrompts.test.mjs` (6): placeholders (both forms, code braces ignored), fill,
      kinds + pick lists, grouping, search, marks, reorder, preview, append.
- [x] 2.3 REAL run on an isolated instance of this build seeded with copies of this hub's live
      registry, arch scope and prompt library (`.claudeweb-preview/arch-prompts-live.ps1` →
      `client/tests/ui/e2e-arch-prompts.mjs`): the panel seeds itself from the real Arch
      examples data on first use; the "investigate" prompt is inserted, its `{machine}` /
      `{agent}` chips offer this hub and its agents, both are filled and the prompt is sent to
      the real arch; "Which agents are free?" is sent with ▶; an edited seed survives a re-seed,
      a deleted one comes back, a custom one stays; the Operator asks the arch to cache a
      prompt and `cache_prompt` stores it; the repo agents' library is untouched throughout.
      Screenshots `docs/screenshots/arch-prompts-*.png`.
- [ ] 2.4 Live after merge + deploy: the Operator's own first-use seed on the hub.

## 3. Ship

- [ ] 3.1 PR against main; the Operator merges and deploys.
