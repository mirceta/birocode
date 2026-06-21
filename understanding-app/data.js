// Diagram specs for the Understanding app. Each is a hand-placed concept graph
// rendered by renderGraph() in mapcore.js. Every node carries role/desc/src so a
// click reveals what it is and which real file it maps to. Facts are drawn from
// the actual code (cited in each `src`).

// ───────────────────────── 1 · SYSTEM MAP ─────────────────────────
// The whole journey of a chat turn: your device → backend → CLI + disk, and the
// autopilot looping back in through the SAME machinery (it is just another caller).
//
// This map uses COMPOUND (parent) boxes so you can read WHERE each piece runs:
//   • tier boxes (box:'tier')  — your device · the backend process · the CLI · disk
//   • backend compartments (box:'sub') nested inside the backend tier — the four
//     services that make up :5099, so "which part of the backend" is visible too.
// A child sits in a box via its `p` (parent id). Parent boxes have no x/y — they
// auto-size to bound their children (preset layout).
var SYSTEM_MAP = {
  nodes: [
    // ---- tier containers (where it runs) ----
    { id: 'T_device',  label: 'YOUR DEVICE · browser', box: 'tier', grp: 'client',
      role: 'The phone / browser', desc: 'Everything in this box is RAM/storage on YOUR device. It can disconnect at any time — the turn does not live here.' },
    { id: 'T_backend', label: 'BACKEND · Kestrel :5099', box: 'tier', grp: 'backend',
      role: 'The harness process', desc: 'The long-lived server that actually owns the Run. Made of four cooperating services (the inner boxes). Survives your phone locking.' },
    { id: 'T_cli',     label: 'CLI PROCESS', box: 'tier', grp: 'cli',
      role: 'A spawned child process', desc: 'A separate OS process (claude) the backend launches detached. Its lifetime is tied to the RunSession token, not your HTTP request.' },
    { id: 'T_disk',    label: 'DISK · persistent', box: 'tier', grp: 'store',
      role: 'The filesystem', desc: 'Outlives every process. The transcript here is the durable source of truth the autopilot reads from.' },

    // ---- backend compartments (which part of :5099) ----
    { id: 'B_http',   label: 'HTTP surface', box: 'sub', grp: 'backend', p: 'T_backend',
      role: 'The web edge of the backend', desc: 'The controllers that turn HTTP requests into Run operations.' },
    { id: 'B_runs',   label: 'Run ownership · slots', box: 'sub', grp: 'backend', p: 'T_backend',
      role: 'Who-owns-the-turn bookkeeping', desc: 'Hands out the single writer slot per (repo · lane) and keeps the seq-numbered event buffer. The heart of "a chat is a backend Run".' },
    { id: 'B_bridge', label: 'CLI bridge', box: 'sub', grp: 'backend', p: 'T_backend',
      role: 'Backend ⇄ CLI translator', desc: 'Spawns the claude process and reduces its raw stream-json into the stable SSE contract.' },
    { id: 'B_auto',   label: 'Autopilot · background', box: 'sub', grp: 'auto', p: 'T_backend',
      role: 'A hosted BackgroundService', desc: 'Lives inside the backend too, but is just another caller of the same machinery — it has no private path to the CLI.' },

    // ---- actor (outside every box) ----
    { id: 'you', label: 'You · phone / browser', x: -120, y: 175, grp: 'actor', kind: 'actor',
      role: 'End User — the human on the device',
      desc: 'Sends turns from the chat box and reads the streamed reply. Crucially the chat is NOT owned by this tab: lock the phone and the turn keeps running on the backend.' },

    // ---- device tier ----
    { id: 'ctx', label: 'ChatContext.jsx', x: 120, y: 110, grp: 'client', p: 'T_device',
      role: 'Client state (in your browser, RAM)',
      desc: 'Holds convos (messages), seqRefs (last seq seen per chat) and abortRefs (the live SSE reader). On mount / tab-focus it reconciles and re-attaches to the running Run via stream?after=N, deduping by seq.',
      src: 'client/src/context/ChatContext.jsx' },
    { id: 'ls', label: 'localStorage', x: 120, y: 250, grp: 'client', kind: 'db', p: 'T_device',
      role: 'Tiny persistent store on the device',
      desc: 'Remembers the active sessionId per chat so a reload can re-attach to the same backend Run.' },

    // ---- backend tier (inside compartments) ----
    { id: 'chatctl', label: 'ChatController.cs', x: 430, y: -20, grp: 'backend', p: 'B_http',
      role: 'HTTP surface for chat',
      desc: 'POST /api/chat (start a turn), GET /api/chat/stream?after=N (attach / re-attach), GET /api/runs, POST /api/chat/stop.',
      src: 'ClaudeWeb.App/Controllers/ChatController.cs' },
    { id: 'runsvc', label: 'RunSessionService.cs', x: 430, y: 170, grp: 'backend', p: 'B_runs',
      role: 'Owner of every chat Run',
      desc: 'TryBeginRun(repoId, lane) hands out ONE writer slot per (repo · lane). Keeps a seq-numbered event buffer (seq is monotonic per repo ACROSS runs) and replays it to every subscriber, so attach/re-attach never drops or doubles an event.',
      src: 'ClaudeWeb.App/Services/RunSessionService.cs' },
    { id: 'builder', label: 'builder slot', x: 360, y: 295, grp: 'backend', kind: 'slot', p: 'B_runs',
      role: 'The single writer lane',
      desc: 'One per repo. Every turn that WRITES must claim it first. You, the classifier and loop mode all call the same TryBeginRun — so they can never run concurrently on one agent. First caller wins.' },
    { id: 'ask', label: 'ask slot', x: 510, y: 295, grp: 'backend', kind: 'slot', p: 'B_runs',
      role: 'The read-only lane (separate slot)',
      desc: 'A side conversation on --permission-mode plan. It is its OWN slot, so it runs concurrently with a builder turn — it can read but not write, so it is safe to overlap.' },
    { id: 'clisvc', label: 'CliRunnerService.cs', x: 690, y: 20, grp: 'backend', p: 'B_bridge',
      role: 'Spawns the CLI & translates its output',
      desc: 'RunAsync launches the claude process detached and reduces its stream-json stdout into the small stable SSE contract, stamping each event with the next seq.',
      src: 'ClaudeWeb.App/Services/CliRunnerService.cs' },
    { id: 'auto', label: 'AutopilotService.cs', x: 470, y: 440, grp: 'auto', p: 'B_auto',
      role: 'The autopilot tick (background service)',
      desc: 'On each tick it reads the last reply from the JSONL transcript and may drive a turn — but only via the SAME TryBeginRun + CliRunnerService.RunAsync you use. Suggest-only until the operator gate is opened. Loop mode (deterministic resend) takes precedence over the classifier on a repo.',
      src: 'ClaudeWeb.App/Services/AutopilotService.cs' },

    // ---- CLI + disk tiers ----
    { id: 'claude', label: 'claude process', x: 960, y: 20, grp: 'cli', kind: 'proc', p: 'T_cli',
      role: 'The actual Claude Code CLI',
      desc: 'Runs on the RunSession\'s own Cts token — never the HTTP request\'s RequestAborted. That is why a disconnected phone does not kill the turn. Emits stream-json on stdout.' },
    { id: 'jsonl', label: '~/.claude/…/<sid>.jsonl', x: 960, y: 250, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'Append-only transcript on disk',
      desc: 'The CLI writes the full conversation here regardless of who is watching. It is the autopilot\'s read source — the tick reads the last reply from this file to decide what (if anything) to send next.' },
  ],
  edges: [
    { s: 'you', t: 'ctx', label: 'types · reads' },
    { s: 'ctx', t: 'chatctl', label: 'POST /api/chat' },
    { s: 'ctx', t: 'ls', label: 'saves sessionId' },
    { s: 'chatctl', t: 'runsvc', label: 'TryBeginRun(repo, lane)' },
    { s: 'runsvc', t: 'builder', label: 'claims writer slot' },
    { s: 'runsvc', t: 'ask', label: 'separate · concurrent' },
    { s: 'chatctl', t: 'clisvc', label: 'RunAsync' },
    { s: 'clisvc', t: 'claude', label: 'spawn detached · Cts token', rel: 'spawn' },
    { s: 'claude', t: 'jsonl', label: 'append-only transcript' },
    { s: 'claude', t: 'clisvc', label: 'stream-json stdout' },
    { s: 'clisvc', t: 'runsvc', label: 'stamp seq · buffer · broadcast' },
    { s: 'runsvc', t: 'ctx', label: 'SSE events · seq-dedup', rel: 'stream' },
    { s: 'auto', t: 'runsvc', label: 'tick → TryBeginRun', rel: 'flow' },
    { s: 'auto', t: 'clisvc', label: 'TrySend / TrySendLoop', rel: 'flow' },
    { s: 'jsonl', t: 'auto', label: 'reads last reply', rel: 'read' },
  ],
};

// ───────────────────────── 2 · LIFE OF A TURN ─────────────────────────
// The five stages of one turn, plus the reject branch and the loop-back that
// makes the autopilot possible.
var TURN_FLOW = {
  nodes: [
    { id: 'claim', label: '① Claim the slot', x: 0, y: 140, grp: 'backend',
      role: 'TryBeginRun(repoId, "builder")',
      desc: 'Success → a fresh RunSession whose seq continues from the previous run\'s last seq. The very first gate of every turn.' },
    { id: 'rej', label: '✗ rejected', x: 0, y: 320, grp: 'backend',
      role: 'Slot already taken',
      desc: 'You get HTTP 409 Conflict. The autopilot drivers simply skip (IsBusy is true / TryBeginRun returns false) — they never pile on.' },
    { id: 'spawn', label: '② Spawn detached', x: 250, y: 140, grp: 'cli', kind: 'proc',
      role: 'Task.Run → claude -p …',
      desc: 'claude -p "…" --output-format stream-json --include-partial-messages --verbose (--resume <sid> to continue), on session.Cts.Token — not RequestAborted.' },
    { id: 'buffer', label: '③ Translate & buffer', x: 510, y: 140, grp: 'backend',
      role: 'CliRunnerService + RunSessionService',
      desc: 'Each stream-json line → one small SSE event, stamped with the next seq, appended to the buffer and broadcast to every subscriber — all under one lock, so replay and live never drop or double.' },
    { id: 'reads', label: '④ Your tab reads', x: 770, y: 55, grp: 'client',
      role: 'SSE stream → ChatContext',
      desc: 'The client ignores any seq ≤ its watermark, so re-delivery on re-attach is harmless (idempotent). Lock the phone and re-open: it catches up via stream?after=N.' },
    { id: 'ends', label: '⑤ It ends · slot frees', x: 770, y: 225, grp: 'backend',
      role: 'done / error → Complete()',
      desc: 'Terminal done → status done; cancel/crash/is_error → error. The slot frees and the JSONL transcript is on disk regardless of who was watching.' },
  ],
  edges: [
    { s: 'claim', t: 'spawn', label: 'success' },
    { s: 'claim', t: 'rej', label: 'slot taken → 409 / skip', rel: 'reject' },
    { s: 'spawn', t: 'buffer', label: 'stream-json', rel: 'spawn' },
    { s: 'buffer', t: 'reads', label: 'SSE · seq', rel: 'stream' },
    { s: 'buffer', t: 'ends', label: 'terminal event' },
    { s: 'ends', t: 'claim', label: 'freed → next driver\'s tick', rel: 'read' },
  ],
};

// ───────────────────────── 3 · SSE CONTRACT (fan-out) ─────────────────────────
// Raw stream-json reduced to seven stable event shapes the client understands.
var SSE_FAN = {
  nodes: [
    // tier boxes make the boundary obvious: raw CLI on the left never crosses into
    // the client box — only the seven reduced shapes do.
    { id: 'S_cli',    label: 'CLI PROCESS', box: 'tier', grp: 'cli',
      role: 'The spawned process', desc: 'Emits verbose stream-json. Nothing here is sent to the browser verbatim.' },
    { id: 'S_back',   label: 'BACKEND · reducer', box: 'tier', grp: 'backend',
      role: 'The :5099 process', desc: 'The single choke point that converts raw CLI output into the stable contract.' },
    { id: 'S_client', label: 'CLIENT · seven stable shapes', box: 'tier', grp: 'client',
      role: 'What the browser actually receives', desc: 'Every event the frontend understands is one of these seven — and nothing else.' },

    { id: 'claude', label: 'claude · stream-json', x: 0, y: 200, grp: 'cli', kind: 'proc', p: 'S_cli',
      role: 'Raw CLI output',
      desc: 'Verbose stream-json on stdout — partial messages, tool calls, usage, results. The frontend never sees this directly.' },
    { id: 'cli', label: 'CliRunnerService', x: 280, y: 200, grp: 'backend', p: 'S_back',
      role: 'The reducer',
      desc: 'Parses each stream-json line and emits one of seven stable SSE shapes (one JSON object per data: line).',
      src: 'ClaudeWeb.App/Services/CliRunnerService.cs' },
    { id: 'e_session',  label: 'session',  x: 580, y: 0,   grp: 'client', p: 'S_client', role: 'from system/init', desc: 'Carries the sessionId — the resume key.' },
    { id: 'e_token',    label: 'token',     x: 580, y: 65,  grp: 'client', p: 'S_client', role: 'from text_delta', desc: 'Visible answer text, streamed into the bubble.' },
    { id: 'e_thinking', label: 'thinking',  x: 580, y: 130, grp: 'client', p: 'S_client', role: 'from thinking delta', desc: 'Reasoning — shown dimmed, never in the answer bubble.' },
    { id: 'e_tool',     label: 'tool',      x: 580, y: 195, grp: 'client', p: 'S_client', role: 'from tool_use / tool_result', desc: 'start → input (summary + detail) → end (ok, preview).' },
    { id: 'e_usage',    label: 'usage',     x: 580, y: 260, grp: 'client', p: 'S_client', role: 'from message.usage', desc: 'Context-fill token count (the context meter).' },
    { id: 'e_done',     label: 'done',      x: 580, y: 325, grp: 'client', p: 'S_client', role: 'from result', desc: 'sessionId + cost. Terminal: finalizes the run as done.' },
    { id: 'e_error',    label: 'error',     x: 580, y: 390, grp: 'client', p: 'S_client', role: 'is_error / throttle / exit≠0', desc: 'A message. Terminal: finalizes the run as error.' },
  ],
  edges: [
    { s: 'claude', t: 'cli', label: 'stream-json stdout', rel: 'spawn' },
    { s: 'cli', t: 'e_session', rel: 'stream' },
    { s: 'cli', t: 'e_token', rel: 'stream' },
    { s: 'cli', t: 'e_thinking', rel: 'stream' },
    { s: 'cli', t: 'e_tool', rel: 'stream' },
    { s: 'cli', t: 'e_usage', rel: 'stream' },
    { s: 'cli', t: 'e_done', rel: 'stream' },
    { s: 'cli', t: 'e_error', rel: 'stream' },
  ],
};
