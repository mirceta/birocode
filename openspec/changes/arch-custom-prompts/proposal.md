# Proposal: arch-custom-prompts — the repo agents' custom prompts, for the Arch agent conversation

Fleet task `ebc9119216d74181b191a7ac2aea0774` (Operator, 2026-10-07). Builds on
`organize-custom-prompts` / `add-prompt-templates` (the repo agents' prompt library) and
`arch-examples-tab` (PR #156, the mined request categories).

## Why

The Operator keeps repeating the same ~20 requests to the arch agent — pull main and redeploy
this hub, update the fleet except one machine, a feature task for a free birocode agent, a
tracking-only card, which agents are free, reflect a merged PR on a card… The repo agents have
a CUSTOM PROMPTS feature (a backend-synced library of emoji + label + text presets, a ⚙ modal
with Use buttons, `{{placeholder}}` templates with a fill-in form); the Arch agent conversation
has nothing of the kind, and the Arch examples tab (PR #156) only lets one copy a template to
the clipboard. Those requests should be one click away, on the arch conversation itself.

## What changes

1. **One prompt library, with owners.** `PromptsService` / `prompts.json` gain an `owner`:
   the repo agents' prompts stay owner-less (every old caller — the composer modal, the
   suggestion loop's routines — reads exactly what it read before); the arch's cached prompts
   live under owner `arch` with a `category` (the panel's group), a `hint` (how to phrase it),
   the `seedId` of the Arch-examples category they came from and an `edited` flag. Reorder,
   duplicate and seeding are added to the same service and controller (`GET
   /api/prompts?owner=arch`, `POST /api/prompts/reorder`, `POST /api/prompts/{id}/duplicate`,
   `POST /api/prompts/seed/arch`). No second store, no second implementation.
2. **The Cached prompts panel** on the Arch agent conversation (the Operator-facing tab in the
   harness and in the Management App; the same component renders in the Subagents tab's
   conversation view, so a held goal's composer has it too): cards grouped by category; click
   = insert into the composer (editable before sending), ▶ = send now; add / edit / delete /
   duplicate / reorder; search; every card marked seeded / edited / custom.
3. **Placeholders as chips.** `{machine}`, `{agent}`, `{task}`, `{pr}`, `{url}`, `{branch}`,
   `{text}`… (and the repo agents' `{{name}}` form) render as fill-in chips above the arch
   composer while the draft holds them; machines, agents and branches are picked from the
   arch's own state (`list_machines` / `list_agents` data), cards from the task graph, the rest
   is free text. The draft stays the single source of truth.
4. **Seeded from the Arch examples.** On first use (an empty arch library) and on "Re-seed
   from Arch examples": one prompt per mined category, phrased the way the Operator asks, with
   placeholders and the category's "how to phrase it" tip — a curated wording for every known
   category, a converted template for any category the miner adds later. A re-seed adds the
   missing categories only; edited and custom prompts are never touched.
5. **Arch tool parity.** `cache_prompt(label, text, category, hint)`, `list_cached_prompts`,
   `remove_cached_prompt(id)` — the arch's counterpart of the repo agents' "add to cached
   prompts" tool, honoured only on the Operator's ask; role prompt v18 says so.

## Out of scope

Prompt plans and notes for the arch (the repo agents' other two modal tabs); editing the repo
agents' library from the arch panel; placeholder chips on the repo agents' composer (their
fill-in form stays as it is).
