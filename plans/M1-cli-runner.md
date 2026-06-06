# M1: Backend CLI Runner

**Blocked by:** M0
**Blocks:** M5 (Frontend Chat UI)

## Goal

Chat with Claude Code over HTTP. This is the core engine of the app.

## Files You Own

- `ClaudeWeb.App/Services/CliRunnerService.cs` -- spawns and manages
  the Claude CLI process, parses stream-json output
- `ClaudeWeb.App/Services/SessionService.cs` -- lists and parses JSONL
  session files from ~/.claude/projects/
- `ClaudeWeb.App/Controllers/ChatController.cs` -- POST /api/chat,
  GET /api/sessions

Register your services in DI (Program.cs) and add controller routes.
Do not create a separate web server -- use the Kestrel from M0.

## Endpoints

```
POST /api/chat
  Body: { "message": "string", "sessionId": "string?" }
  Response: SSE stream (text/event-stream)

  If sessionId is provided, runs: claude --resume <sessionId> -p "<message>"
  If omitted, starts a new session.

  SSE event format: see "Verified CLI Contract" below -- the event
  shapes were captured from the real CLI, not inferred.

GET /api/sessions
  Response: [{ id, title, turnCount, lastModified, firstPrompt }]

  Lists JSONL files in ~/.claude/projects/<encoded-cwd>/
  Extracts metadata from each file.
```

## Verified CLI Contract (captured from real `claude` v2.1.92)

This section is REAL DATA from running the CLI, not assumptions. Build
against this exactly. Three earlier assumptions were WRONG -- see the
"Corrections" note at the end.

### Spawn command

```
claude -p "<message>" --output-format stream-json --include-partial-messages --verbose
```

Add `--resume <sessionId>` before `-p` when continuing a session.
Set the process working directory to WorkingDirectory from AppConfig.

`--include-partial-messages` is REQUIRED for token-by-token streaming.
Without it you only get whole assistant messages (no live typing effect).

### Output: newline-delimited JSON, one object per line

The CLI emits these top-level event types (`type` field), in order:

```
1. {"type":"system","subtype":"init", "session_id":"...", "cwd":"...", "model":"..."}
   -> session_id is available IMMEDIATELY here. Capture it and send it
      to the client right away so the frontend can resume later.

2. {"type":"stream_event","event":{...}}   <- token-level streaming
   The nested event.type is one of:
     - "message_start"
     - "content_block_start" {index, content_block:{type:"thinking"|"text"|"tool_use", name?}}
     - "content_block_delta" {index, delta:{type, ...}}
         delta.type = "text_delta"      -> delta.text   (VISIBLE answer, stream this)
         delta.type = "thinking_delta"  -> delta.thinking (model's reasoning, see note)
         delta.type = "signature_delta" -> ignore
         delta.type = "input_json_delta"-> tool input args streaming, can ignore
     - "content_block_stop" {index}
     - "message_delta", "message_stop"

3. {"type":"assistant","message":{"content":[...]}}  <- consolidated full turn
   content[] blocks each have "type": "thinking" | "text" | "tool_use"
     - text block:     {"type":"text","text":"..."}
     - tool_use block: {"type":"tool_use","name":"Write","input":{...},"id":"..."}
       -> THIS is the tool-use feedback source for M5 ("Editing X...").
          The tool NAME is here, NOT in a system/progress event.

4. {"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"...","content":"..."}]}}
   -> tool result echoed back after each tool runs.

5. {"type":"rate_limit_event","rate_limit_info":{"status":"allowed",...}}
   -> THROTTLE DETECTION: when status != "allowed", surface a warning.

6. {"type":"result","subtype":"success","result":"<final text>","is_error":false,
       "session_id":"...","total_cost_usd":0.04,"num_turns":1,"duration_ms":3075,"usage":{...}}
   -> terminal event. subtype "success" or "error". "result" is the final
      assistant text. Log cost/tokens to the monitoring GUI from here.
```

### Recommended SSE shape to send to the frontend

Translate the raw CLI events into a small, stable contract for M5 so
the frontend never parses raw CLI internals:

```
data: {"type":"session","sessionId":"..."}        (from system/init)
data: {"type":"token","text":"Hel"}               (from text_delta)
data: {"type":"tool","name":"Write","status":"start"}  (from tool_use block)
data: {"type":"done","sessionId":"...","cost":0.04}    (from result)
data: {"type":"error","message":"..."}            (on result.is_error or throttle)
```

### Thinking blocks -- important

The model streams "thinking" deltas BEFORE the visible answer. Do NOT
forward thinking text as the answer. Either drop it, or emit it as a
separate `{"type":"thinking"}` SSE event so M5 can show a "thinking..."
state without printing chain-of-thought into the chat bubble.

### Corrections to earlier assumptions (now fixed above)

1. Tool-use feedback does NOT come from `system`/`progress` events --
   it comes from `tool_use` content blocks in `assistant`/`stream_event`.
2. session_id is available from the FIRST `system`/`init` event, not
   only from the final `result`. Send it to the client immediately.
3. Token streaming requires `--include-partial-messages`. The plain
   stream-json output is message-level only.

## Key Implementation Details

- Spawn: see Verified CLI Contract above (include `--include-partial-messages`)
- Add `--resume <id>` when continuing a session
- Set working directory to WorkingDirectory from AppConfig
- Parse stdout line-by-line -- each line is a complete JSON object
- Translate raw CLI events into the stable SSE contract above
- Only one CLI process at a time (queue or reject concurrent requests)
- Capture session ID from the "result" event for future resume
- Encoded CWD format: `c:\Users\km\...` becomes `c--Users-km-...`
  (replace `:` `\` `/` with `-`)
- Log every event to Logger: session start, tool use, completion, errors

## ClaudeMonitor Code to Reference

These are in the same repository. Read them, follow the patterns:

- `ClaudeMonitor/ClaudeMonitor.App/Services/ClaudeCliRunner.cs` --
  Process.Start, stdout/stderr streaming, stream-json line parsing.
  This is the closest reference for CliRunnerService.
- `ClaudeMonitor/ClaudeMonitor.App/Services/StreamJsonParser.cs` --
  Parsing individual stream-json events.
- `ClaudeMonitor/ClaudeMonitor.App/Services/ConversationStore.cs` --
  ExtractMetadata method: JSONL parsing for session listing.
  This is the closest reference for SessionService.
- `ClaudeMonitor/ClaudeMonitor.App/Services/ClaudeService.cs` --
  Overall orchestration, stderr throttle detection.

## Verify

```bash
# Start a new chat
curl -N -X POST http://localhost:5099/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"say hello"}'
# Should stream back SSE events

# List sessions
curl http://localhost:5099/api/sessions
# Should return a JSON array
```

Also verify the monitoring GUI shows log entries for the chat request.

## Do Not Touch

- `ClaudeWeb.App/Services/FileService.cs` or /api/files endpoints (M2)
- `ClaudeWeb.App/Services/GitService.cs` or /api/save, /api/history (M3)
- `ClaudeWeb.App/UI/MainForm.cs` (M0 -- log to it via Logger, don't modify)
- Any files under `client/` (M4, M5, M6, M7)
