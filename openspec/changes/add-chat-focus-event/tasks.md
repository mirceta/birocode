## 1. Backend — publish endpoint

- [x] 1.1 Add `POST /api/events/chat-focus` to `HarnessEventsController`: fixed type `chat.focus`, repo derived from the `X-Repo-Id` header, repo name resolved server-side, body's optional dock context (tab id) passed into `data`, calls `HarnessEventFeed.Publish`, returns 204; no caller-supplied `type` honored
- [x] 1.2 Verify auth: endpoint sits behind the existing session auth like other `/api/*` routes (unauthenticated call rejected, no event appended)

## 2. Client — emit on dock composer focus

- [x] 2.1 In `ChatInput.jsx`, add an `onFocus` handler on the composer textarea that, only when dock-embedded, fires a debounced `apiPost('events/chat-focus', ...)` with the dock's repo id and tab context
- [x] 2.2 Implement the 10 s per-composer cooldown (module-level timestamp; refocus inside the window emits nothing) and make the call fire-and-forget (errors swallowed, composer never disturbed)
- [x] 2.3 Confirm the main (non-dock) Chat page composer does not emit

## 3. Sounds — browser (events-app)

- [x] 3.1 Add a `SOUNDS["chat.focus"]` synth motif audibly distinct from the turn cues (short, soft "attention" figure)
- [x] 3.2 Add a `chat.focus` entry to `CUE_SLOTS` so a custom file can be assigned/tested/cleared like the turn types

## 4. Sounds — host (`HostEventSound`)

- [x] 4.1 Add `chat.focus` to the recognized slots array; give it a distinct beep pattern in `DoBeep` and a source-naming voice phrase in `PhraseFor`
- [x] 4.2 Confirm the event → sound rules table picks up the new slot (list/upload/clear/per-slot test) with the same precedence as the turn slots

## 5. Verify

- [x] 5.1 Build the frontend and an isolated harness build (self-dev rules); run isolated on a test port
- [x] 5.2 End-to-end: focus a dock composer → `chat.focus` appears in `GET /api/events` and `GET /api/collector/events` with correct envelope; rapid refocus emits once
- [x] 5.3 Browser check (Playwright, per `docs/claude-web/browser-testing.md`): events-app plays/registers the distinct cue and shows the new custom-sound slot
- [x] 5.4 Host check: slot listed by the sound-rules endpoints; per-slot test plays; unauthenticated publish rejected
- [x] 5.5 `openspec validate add-chat-focus-event --strict` still passes; update understanding-app if the explanation is presented
