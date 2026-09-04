# Design — reduce-transcript-io

## D1. Incremental transcript parsing (`TranscriptCache<TAcc>`)

A generic per-path cache in `Services/Chat/TranscriptCache.cs`:

```
Entry { TAcc Acc; long Offset; long Length; DateTime LastWriteUtc; }
Read(path): stat → (a) same length+mtime → return Acc
                   (b) length > Offset and first-chunk unchanged → feed lines from Offset
                   (c) otherwise (shrunk, or same length but new mtime = in-place edit
                       such as the NUL-repair) → new Acc, feed from 0
```

- **Whole lines only.** The reader consumes bytes up to the last `\n`; a trailing
  partial line (the CLI mid-append) stays unconsumed and is re-read next time.
  Splitting happens on the byte `0x0A` (never part of a UTF-8 multibyte
  sequence), each line is decoded separately, so chunk boundaries are safe.
- **Existing resilience is preserved**: `Trim('\0')`, skip-malformed-line, one
  `JsonDocument` per line, disposed after feeding.
- **Accumulators** are the three existing parsers refactored into stateful
  `Feed(JsonElement root)` classes: `MessagesAcc`, `ToolCallsAcc` (keeps its
  `byId` map so a `tool_result` arriving in a later append still patches its
  `tool_use`), `ToolHistoryAcc(maxResultChars)` (keeps the turn counter). The
  public getters return a copy of the accumulator's list under the entry lock.
- **Bounded**: each cache keeps the most recently used 24 files; an evicted
  file re-parses in full on its next read (the pre-change behaviour).
- **Per-entry lock** gives single-flight: two concurrent readers of the same
  file (the 5 s Dashboard tick and the chat reconcile) do one parse.
- `ListSessions` metadata (`ExtractMetadata`) gets its own (length, mtime) →
  `SessionSummary` cache; unbounded but tiny (one record per transcript).
- Discovery uses `ReadMessagesUncached` so mining every historical session does
  not pollute the hot cache; it keeps its own result cache (D3).

Why not a backwards tail reader for "last assistant message"? The incremental
cache makes that read a `stat` when nothing changed and a delta parse when
something did, which is strictly better than re-scanning the tail each tick.

## D2. Client: stop the 5 s full-transcript polls

- `ChatContext.loadTranscript(key, id, repoId)`: a `Map<key, {id, promise}>` of
  in-flight loads; a second call for the same (key, id) awaits the first. This
  closes the window where `attachToRun`'s `fresh` check (messages ≤ 1) is true
  on every reconcile tick while the first load is still streaming 3.4 MB.
- **Dashboard activity**: `POST /api/sessions/activity` with
  `{ items: [{ repoId, sessionId }] }` → `{ [sessionId]: { activity, lastUserAt,
  count } }`. The server resolves each repo by id, reads the cached messages,
  and returns the last assistant line (≤ 500 chars, whitespace-collapsed) and
  the newest user timestamp — the two values `latestActivity` / `lastUserAt`
  derived client-side. One request per tick instead of one per visible dock,
  and a few hundred bytes instead of megabytes.
- **Arch page**: `document.hidden` guards on all three pollers; `Arch.jsx` polls
  `/arch/messages` only while the Chat lane is shown (`sessionId` comes from
  `/arch` state as well, so the History lane still knows its session).

## D3. Incremental mining

`AutopilotDiscoveryService` keeps `Dictionary<path, (len, mtime, Contribution[])>`
where a contribution is `(key, originalText, sampleSnippet?)` per qualifying user
message. Unchanged files are skipped by stat; changed/new files are re-mined via
`ReadMessagesUncached`; entries for files that no longer exist are dropped. The
grouping/threshold logic is unchanged and runs over the contributions.

## D4. Git

- `GitService.Status(dir, fetch:false)`: memo per dir `{ result, atUtc }`, TTL
  5 s, computed under a per-dir lock (single-flight). `fetch:true` bypasses and
  refreshes the memo. Mutating actions (`Save`, `PullBase`, `MergeBase`, `PullCurrent`,
  `PushCurrent`, `Restore`, `SetCommitIdentity`) invalidate the dir's memo.
- `RunGit` runs under a `SemaphoreSlim(4)` so a burst of pollers cannot spawn
  dozens of `git.exe` at once.
- `ArchAgentService.RemoteUrl` memoized per path for 60 s.
- `GitHubAccountService.CacheTtl` 5 s → 5 min. `Refresh()` is unchanged, so the
  chip still flips immediately after a credential is established.

## D5. Writers

- `Logger`: one `StreamWriter` (FileShare.ReadWrite, AutoFlush) opened lazily and
  kept; re-opened if the write fails. Same line format, same file name.
- `AuditService.Append`: one open writer per day path (swap on day change).
- `AutopilotAuditLog`: entries loaded once into memory, `Record` appends to both
  memory and file, `Recent` serves from memory. The file is only ever written by
  this process, so no staleness.
- Dock/loops/devices JSON rewrites are event-driven (per user action / per run
  start), not periodic — measured as not part of the churn; left as is.

## Measurement

Before: 498 MB read / 10 s at idle (this session's 249 MB transcript, one dock
open). Target after: < 5 MB / 10 s at idle with the same page open, and no
`git.exe` burst on the arch tick. Verified with the same
`Get-Counter`/`Get-Process` IO delta the analysis used
(`.claudeweb-preview/activity-analyze.mjs` + PowerShell `Process.ReadTransferCount`).
