# The arch's memory as a visible, Operator-managed store (fleet task 0953472c)

## Why

The Operator (2026-10-18): "Storing memory was a brilliant idea; storing it on the disk of one computer where the
human never sees it was architecturally wrong — it is a black box, and knowledge cannot be shared across the fleet
by default." Today the arch's memory is ~22 markdown files in `arch-home/memory/`, written by `remember` and read
by `recall`. Nobody but the arch sees them, the arch rarely reads them, several are stale, and goal conversations
use them as progress notes.

## What changes

- **A memory store on the hub** (`%APPDATA%\ClaudeWeb\memory.json`, `MemoryStore`). This harness is the single
  writer; peers can later read `GET /api/memory`.
  - **Fields:** id, title, markdown body, kind (principle | rule | fleet-fact | repo-note | goal-note | other),
    tags (`machine:` / `repo:` / `goal:`), author, created / updated / lastConfirmed / lastUsed, status
    (active | retired), pinned, needsReview, and a version history.
  - **Writes are atomic,** with a `.bak` copy. A damaged file is never silently replaced.
- **A "Memory" tab** in the Management dashboard. Cards are grouped by kind, with filters for kind, tag, author,
  status, stale / review / used / pinned, and search.
  - **Actions:** add, edit, pin, retire / restore, "✓ Still true", delete.
  - **Badges:** STALE after a configurable age; "used recently" when the entry was loaded within the last N arch
    turns.
- **Every arch turn loads it.** The Operator chat, wake turns and goal turns all receive it through
  `--append-system-prompt`:
  - active principles and pinned entries, always;
  - other entries only when their tags match the message, goal, goal repos or conversation in play.
  - Loading records lastUsed.
- **Tools.** `remember` and `recall` keep their names but use the store: `remember` takes kind + reason + tags,
  and the legacy path/text calls are mapped. New `confirm_memory` and `retire_memory`. There is no delete tool.
  - **Role prompt v20:** the "Remember what matters" rule now points at the store, says goal progress goes into
    the step plan, and says never to store secrets.
- **Safety.** A write guard refuses secrets (tokens, keys, private keys, JWTs, connection strings with passwords,
  URLs with credentials, password/secret assignments) with a visible reason. Every write needs a kind and a
  one-line reason. Only the Operator deletes.
- **Migration.** On first run, the home's `memory/*.md` files are imported:
  - author arch, kind by content, dates from the home's git, marked for review;
  - a file that trips the guard is imported with its body withheld.
  - The two first principles are seeded: the Operator's quote above, and the Front desk rule.
  - The `.md` files stay as they were (history).

## Impact

- **Server:** `Services/Memory/MemoryStore.cs`, `Services/Arch/ArchAgentService.Memory.cs`,
  `Controllers/MemoryController.cs`, and the remember/recall/confirm/retire tools in `ArchMcpServer.cs`.
  `TurnSpec.AppendSystemPrompt` goes through `CliRunnerService` to the Claude adapter. The two arch turn paths
  pass the block: `SendToArch` and the loop engine's arch-home sends.
- **Client:** `manage/MemoryTab.jsx`, `memoryModel.js` (+ test), `memory.css`, and the tab in `ManageApp`.
- **Docs:** `docs/agents.md` and the CLAUDE.md glossary row for the Home Repository.
- **Follow-up:** replication to peers over the fleet channel. Peers read; the hub stays the single writer.
