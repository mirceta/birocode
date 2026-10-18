# Tasks — arch-memory-store

- [x] `MemoryStore`: entries, kinds, tags, authors, dates, status, pinned, review, history; atomic save + `.bak`; settings (stale days, used window).
- [x] Write guard (secrets), kind + one-line reason, Operator-only delete.
- [x] Turn context: principles + pinned always, knowledge by whole-word tag match, lastUsed / turn counter.
- [x] `--append-system-prompt` through `TurnSpec` / `CliRunnerService` / Claude adapter; both arch turn paths pass the block.
- [x] Tools: `remember` / `recall` on the store (legacy path/text mapped), `confirm_memory`, `retire_memory`; role prompt v20.
- [x] First-run import of `arch-home/memory/*.md` (kind by content, git dates, review) + the two seeded principles.
- [x] `api/memory` (list, get, add, update, confirm, retire, restore, pin, delete, settings, check, context preview).
- [x] Management "Memory" tab: grouped cards, filters, search, editor, badges (STALE, used recently, review, pinned, always loaded).
- [x] Tests: xunit (store + adapter), node (tab model); full suites green.
- [x] Lab verification on this hub (isolated harness, copy of the arch home): 16/16 with a real arch turn; screenshots.
- [x] Docs: `docs/agents.md`, CLAUDE.md glossary row; Understanding app.
- [ ] Operator: review the imported entries (22 "to review"), retire the stale ones, add principles.
- [ ] Follow-up: peers read the hub's store over the fleet channel.
