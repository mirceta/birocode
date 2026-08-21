# Tasks — fix-transcript-nul-freeze

## 1. Backend

- [x] 1.1 `GetMessages`: per-line try/catch + `Trim('\0')` salvage (mirror
      `GetToolCalls`); update the doc comment
- [x] 1.2 `ExtractMetadata`: same per-line skip so a corrupt session stays in
      the session list
- [x] 1.3 `GetToolCalls`: add the `Trim('\0')` salvage for the merged-line case

## 2. Verify

- [x] 2.1 Unit tests: fixture transcript with NUL run + merged NUL/JSON line +
      malformed line → all messages, paired tool call, listed session
      (`SessionTranscriptResilienceTests`, 3 tests)
- [x] 2.2 Full unit suite green (95/95)
- [x] 2.3 Operational repair of the live transcript (NUL run overwritten with
      spaces in place) verified: live harness went from 5,973 frozen messages +
      read error to 6,268 and growing, error gone
