# Ask lane may write exactly one file (`handoff.md`)

**Status:** Built — verified end-to-end in a scratch dir against claude
v2.1.177; backend compiles; frontend string + safety docs updated. Not yet
browser-verified on a running harness, not committed (branch
`feature/ask-handoff`). Builds on the shipped [Ask lane](plans/repo-ask-chat.md).

## Goal

Upgrade the **Ask** lane so it stays read-only **except** it may **create and
edit exactly one file — `handoff.md` at the repo root** — so an Ask agent can
leave a handoff for another agent without gaining general write access. Every
other mutation stays blocked.

## ⚠️ Convention impact (warn, don't ship silently)

The Ask lane's documented guarantee is **"it can't make changes."** This change
opens a deliberate single-file hole, so the guarantee text MUST be updated as
part of the change:
- `client/src/i18n/en.json` → `chat.askHint` (currently "It can't make changes;
  switch to Project to build") — and any related strings.
- `plans/repo-ask-chat.md` safety/permission section.

The core property otherwise stays intact: **the Ask agent still cannot corrupt
the builder's work — `handoff.md` is the only writable surface.**

## Where it's wired (confirmed, not re-discovered)

- `ClaudeWeb.App/Controllers/ChatController.cs:100` — `var readOnly = lane == "ask";`
- `ClaudeWeb.App/Services/Chat/CliRunnerService.cs:635-638` — adds
  `--permission-mode plan` when `readOnly`.

**Plan mode is all-or-nothing** and cannot be selectively relaxed, so it must be
**replaced** by an explicit tool policy.

## What changes

Replace the ask lane's `--permission-mode plan` with an explicit tool policy that:
- (a) allows read/search tools + normal conversational answering (Read/Grep/Glob);
- (b) allows **Write/Edit ONLY for `handoff.md`** at the repo root;
- (c) blocks every other mutation (other file writes/edits, arbitrary Bash, git
  mutations, deletes).

CLI = **claude v2.1.177**. Verification (below) ruled out the allowlist approach
and settled on a **PreToolUse hook** — see "Settled mechanism."

## Verify (don't assume — same method this repo used for plan mode)

Throwaway run in a scratch dir, headless `-p`, prove the final flag set:
1. still answers a normal question (Read/Grep/Glob work);
2. CAN create and edit `handoff.md`;
3. CANNOT write/edit any other file;
4. CANNOT run a mutating Bash command (e.g. `rm`, `echo > other`, `git commit`).

If `default` lets unlisted tools through or prompts (headless can't answer), tune
`--allowedTools`/`--disallowedTools` until all four hold. Record the exact set.

Then, if the frontend strings change: `npm --prefix client run build` +
browser-verify per `docs/claude-web/browser-testing.md`, and run the relevant
ask tests (`verify-ask-lane.mjs` should still pass for the read-only-except-
handoff posture; adjust its read-only assertion to expect handoff.md writable).

## Settled mechanism (verified 2026-06-15, claude v2.1.177)

**Flags alone can't do this.** Empirically, in headless `-p`:
- `--allowedTools "Write(handoff.md)"` does **not** restrict anything — on a host
  whose settings allow Write (this box has `defaultMode: bypassPermissions` +
  a global Write/Edit/Bash allow), every write went through.
- `--disallowedTools "Write"` **is** absolute (it overrode both the settings
  allow-list and a specific `--allowedTools "Write(handoff.md)"`), but it has
  **no path negation** — it blocks `handoff.md` too. Deny always beats allow.

So "deny all writes except one file" is not expressible with allow/deny lists,
and `--permission-mode plan` blocks every mutation. **Solution: a PreToolUse
hook.** The ask lane now spawns:

```
claude … --permission-mode default --settings <%APPDATA%\ClaudeWeb\ask-guard\settings.json>
```

`settings.json` registers a `PreToolUse` hook (matcher
`Write|Edit|MultiEdit|NotebookEdit|Bash|BashOutput|KillShell`) that runs a
PowerShell guard (`ask-guard.ps1`). The guard reads the hook payload on stdin and:
- **Bash/BashOutput/KillShell → `deny`** (no shell in the ask lane).
- **Write/Edit/MultiEdit/NotebookEdit →** `allow` iff the target path resolves to
  `<cwd>/handoff.md` (cwd comes from the payload), else `deny`.
- everything else → silent (normal flow → reads/answers work).

A hook `deny` overrides allow-lists **and** a `bypassPermissions` default, so the
policy holds regardless of the host's global config. PowerShell (not node) is
used — always present on Windows, no runtime dependency on the prod box. The
guard files are generated lazily into `%APPDATA%\ClaudeWeb\ask-guard\` by
`CliRunnerService.AskGuardSettingsPath` (written once per process; a restart
regenerates them, so edits ship on next launch).

### Verification results (scratch git repo, headless `-p`)

One prompt asked the agent to do all five; results from the **real deployment
path** (`%APPDATA%\ClaudeWeb\ask-guard\settings.json`):

| Action | Outcome |
|--------|---------|
| Read `notes.txt`, report the secret number | ✅ answered `42` |
| Create `handoff.md` | ✅ created |
| Edit existing `handoff.md` (append a line) | ✅ edited |
| Create `evil.txt` | ❌ denied |
| Append to `notes.txt` | ❌ denied |
| `touch bashfile.txt` (shell) | ❌ denied |

All four required properties hold.

## Files changed

- `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` — `AskGuardScript` const +
  `AskGuardSettingsPath` lazy generator; the `readOnly` branch now adds
  `--permission-mode default --settings <path>` instead of `--permission-mode plan`.
- `client/src/i18n/en.json` — `chat.askHint` updated to "can't change the project,
  except it may leave a handoff in handoff.md."
- `plans/repo-ask-chat.md` — amendment notes on the Status header and Safety section.

## Constraints

- Minimal change; keep the rest of the safety property intact.
- Ask lane only; builder lane unchanged.
- Stage explicit paths (no `git add -A`); don't commit unless asked.
