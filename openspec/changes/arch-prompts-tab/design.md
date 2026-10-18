# Design — arch-prompts-tab

## Where things live now

| Concern | Before (in the Arch chat) | After |
|---|---|---|
| Browse / search the library | panel above the composer | **Prompts tab**: grouped cards, search, origin filter |
| Add / edit / duplicate / reorder / delete / re-seed | panel above the composer | **Prompts tab** (the same `PromptForm`, extracted) |
| Fill placeholders | composer chips, after inserting | **Use sheet** on the card (live pick lists), or the composer chips as before |
| Send | ▶ only for prompts without placeholders | **▶ Send to the arch** once every placeholder is filled |
| Quick insert while typing | click a card in the panel | **📋 Prompts** picker in the composer row (most used first) |
| Usage | not tracked | `uses` + `lastUsedAt` per prompt, shown on cards, sorting the picker |
| Tools a prompt leads to | not shown | from the Arch examples catalogue (`category.tools` by the prompt's `seedId`) |

## Hand-off from the tab to the chat

```
Prompts tab "Open in Arch chat"
  └─ archHandoff.handoffToArch(text)
       ├─ sessionStorage['arch.handoffDraft'] = text      (a composer that mounts later still gets it)
       ├─ window event 'arch:handoff-draft'               (a mounted composer gets it now)
       └─ window event 'manage:open-tab' {tab:'arch'}     (ManageApp switches tab, or un-hides the pane)
Arch.jsx (conv @arch, chat view) takes the hand-off once, appends it to the draft, never sends it by itself
```

The same `manage:open-tab` event backs the picker's "Manage prompts in the Prompts tab →" link. That link is
shown only inside the Management App (`popup`); the studio's Arch page has no Prompts tab.

## Store and tools: unchanged in behaviour

| | |
|---|---|
| endpoints | `/api/prompts?owner=arch`, POST, PATCH, DELETE, reorder, duplicate, `seed/arch` as before; **new** `POST /api/prompts/{id}/used` |
| record | `+ Uses` (default 0), `+ LastUsedAt` (default null). Older files deserialize unchanged; an edit keeps the count; a duplicate starts at 0 |
| seeding | first use of an empty library seeds once; a re-seed adds missing categories only — moved verbatim from the panel |
| arch tools | `cache_prompt` / `list_cached_prompts` / `remove_cached_prompt` untouched |

## Evidence

- `ArchCachedPromptsTests.Uses_are_counted_…` (.NET, 978/978).
- `archPrompts.test.mjs` (segments, usage, fillAll, byUse) and `archHandoff.test.mjs`; client suite 302/302.
- Lab on this hub (`.claudeweb-preview/promptlab/lab.ps1`, an isolated harness with a copy of the live prompt
  library and a fresh arch home):
  - **before** (origin/main's committed bundle): the old block above the composer;
  - **after**, 20/20: 25 cards in 6 groups, placeholder chips, tools on 22 seeded cards; a test prompt filled
    from the live machine list and sent, with a **real arch turn** answering; the use counted; "Open in Arch
    chat" landing in the composer; no in-chat panel; one 📋 Prompts picker; duplicate / edit / delete.
  - The sent prompt is a harmless test prompt ("reply PONG for {machine}, use no tools"), never a seeded fleet
    command.
