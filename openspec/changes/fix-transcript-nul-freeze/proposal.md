# fix-transcript-nul-freeze — one corrupt transcript line must not freeze the rendered conversation

## Why

On 2026-08-20 the web chat rendered the long-running self-repo conversation
frozen at 2026-08-07, while sending a message still resumed with full context.
The session's 239 MB `.jsonl` contained a ~57 KB run of NUL bytes (crash-padding
left by a writer killed mid-append on Aug 7); the CLI kept appending valid turns
after the zeros, so resume was fine — but `SessionService.GetMessages` wraps its
whole read loop in one try/catch, so the first unparseable line aborted the read
and every cold load returned only the pre-corruption prefix (5,973 messages).
The live in-memory run buffers masked this for 13 days; the Aug-20 deploy +
auto-rollback restarts wiped them and exposed the frozen transcript path.
`ExtractMetadata` had the same flaw with a worse symptom: the whole session
vanishes from the sidebar list. `GetToolCalls` already did it right (per-line
skip).

## What Changes

- **Per-line resilience in every transcript reader**: `GetMessages` and
  `ExtractMetadata` skip an unparseable line and keep reading, mirroring the
  existing `GetToolCalls` pattern. One bad line costs at most that line, never
  the rest of the transcript.
- **NUL salvage**: all three readers `Trim('\0')` before parsing, so a real
  JSON line merged with a crash-padding run (zeros directly followed by the
  next append) is recovered rather than skipped.
- The one-off repair of the live transcript (zeros overwritten in place with
  spaces, same length) was operational, not code — recorded here for context.

## Capabilities

### Modified Capabilities
- `chat`: transcript reads (messages, tool calls, session list metadata)
  tolerate corrupt lines instead of truncating or dropping the session.

## Impact

- **Backend**: `ClaudeWeb.App/Services/Chat/SessionService.cs` only —
  `GetMessages`, `ExtractMetadata`, and a `Trim('\0')` in `GetToolCalls`.
- **Frontend / API / storage**: untouched; same endpoints, same shapes.
- **Tests**: `tests/ClaudeWeb.Tests/SessionTranscriptResilienceTests.cs` — a
  fixture transcript with a NUL run, a merged NUL+JSON line and a malformed
  line must yield all messages, the paired tool call, and a listed session.
