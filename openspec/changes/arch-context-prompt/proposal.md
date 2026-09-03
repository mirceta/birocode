# Arch tab: copy a prompt that points any repo agent at the arch conversation

## Why

The operator kept referring, inside a repo agent's chat, to "what I told the arch
agent" — and the repo agent could only find that conversation if it happened to
know (from memory or from reading the harness source) that the arch agent's chat
is `GET /api/arch/messages` behind the password, or a session .jsonl under the
arch home's projects folder. A fresh agent has none of that. The knowledge should
be one copy-paste away, produced by the harness itself with the live session id
and real paths.

## What changes

1. `GET /api/arch` gains `session.transcriptPath` — the absolute on-disk path of
   the arch conversation's .jsonl (`SessionService.ProjectsDirectoryFor(home)` +
   session id), null before first arm.
2. The Arch tab header gains a **⧉ Copy agent prompt** button that copies a
   self-contained prompt to the clipboard: the arch session id, the transcript
   path (no credentials needed to read it), the three API routes as fallback
   (`/api/arch/messages`, `/api/arch/tool-calls`, `/api/arch`) with a note that
   the access code must come from the operator — the prompt NEVER embeds the
   password — and a warning that actor-tagged user lines are harness-driven.

## Impact

- `ClaudeWeb.App/Controllers/ArchController.cs` (state block)
- `client/src/pages/Arch.jsx`, `client/src/pages/arch.css`
- spec `arch-agent` (ADDED requirement)
