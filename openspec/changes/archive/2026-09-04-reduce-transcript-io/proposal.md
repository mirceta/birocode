# Reduce the harness's disk I/O (transcript re-reads, git spawns, log handles)

## Why

2026-09-02/03: the host bugchecked four times (0x3B, 0x1E, 0xE3). Both minidumps
put Windows Defender's file-system filter (WdFilter.sys, via FLTMGR) on the stack.
The harness was the box's largest file-I/O source: at idle, ClaudeWeb.exe read
**498 MB per 10 s** (127k 4 KB reads) because `GET /api/sessions/{id}/messages`
re-parses the whole JSONL transcript from byte zero on every call, and the web UI
asks for it every 5 s (the chat reconcile's "fresh conversation" path, and the
Dashboard's per-dock activity poll) — against a 249 MB transcript that the CLI is
appending to at the same time. Secondary churn: the autopilot discovery pass
re-parses every transcript of every repo (747 MB) every 5 min; the arch loop and
the arch state endpoint spawn `git status` 9–17 times per managed repo per tick;
the `gh` account chip spawns two processes every 5 s; the logger and audit writers
open/append/close their file for every line.

A user program cannot bugcheck Windows directly, but it can push enough file I/O
through a fragile filter driver to make the filter fault. Cutting the harness's
I/O is the lever we own (the OS patch level, the Defender exclusions and the
third-party kernel drivers are the operator's).

## What changes

1. **Incremental, cached transcript reads** — `SessionService` keeps a per-file
   parse state (bytes consumed, length, mtime, accumulated result). An unchanged
   file costs one `stat`; an appended file parses only the new complete lines; a
   shrunk or rewritten file re-parses from zero. Applies to messages, tool calls,
   tool-call history and session metadata. Only whole lines (terminated by `\n`)
   are consumed, so a line the CLI is still writing is never half-read.
2. **Clients stop re-downloading whole transcripts** — one in-flight guard per
   conversation in `ChatContext.loadTranscript`; the Dashboard's per-dock
   activity comes from a new batch endpoint `POST /api/sessions/activity`
   (last assistant line + last user timestamp, computed server-side from the cache)
   instead of N full transcripts every 5 s; the Arch page's three pollers are
   visibility-gated and the transcript is only polled while the Chat lane is shown.
3. **Incremental autopilot mining** — the discovery pass caches each session's
   mined contribution by (length, mtime) and re-parses only changed files; the
   10 s tick's "last assistant message" read rides the transcript cache.
4. **Memoized git status, fewer spawns** — `GitService.Status` (no-fetch) is
   memoized per working dir with a 5 s TTL and single-flight; git processes go
   through a small semaphore; the arch service memoizes the remote URL; the `gh`
   account cache TTL goes from 5 s to 5 min (`Refresh()` still forces a probe).
5. **Open log handles, in-memory audit** — `Logger` and `AuditService` keep their
   day file open (shared read) instead of open/append/close per line; the
   autopilot send audit keeps its entries in memory (write-through) so the
   transcript endpoint's actor annotation no longer re-reads the audit file.

Out of scope: Defender exclusions, OS patching, driver removal (operator actions,
documented in the Understanding app); a WebSocket/HTTP-2 transport.

## Capabilities

- `host-runtime` (delta): transcript reads are incremental; git status memoized;
  log writers hold their handle.
- `client-traffic` (delta): no steady-state full-transcript polling; batch
  activity endpoint; Arch pollers gated.

## Impact

- Server: `Services/Chat/SessionService.cs` (+ new `TranscriptCache.cs`),
  `Controllers/ChatController.cs` (new endpoint), `Services/Autopilot/
  AutopilotDiscoveryService.cs`, `AutopilotAuditLog.cs`, `Services/Git/GitService.cs`,
  `Services/Arch/ArchAgentService.cs`, `Services/Accounts/GitHubAccountService.cs`,
  `Services/Logging/Logger.cs`, `Services/Audit/AuditService.cs`.
- Client: `context/ChatContext.jsx`, `pages/Dashboard.jsx`, `pages/Arch.jsx`,
  `components/arch/ArchHistoryPanel.jsx`, `components/arch/ArchToolsPanel.jsx`.
- Tests: `tests/ClaudeWeb.Tests/TranscriptCacheTests.cs`.
- No API contract removed; `/api/sessions/{id}/messages` and `/tools` keep their
  shape and become cheap on repeat.
