// Diagram specs for the "How autopilot works" dock tab. Sibling of
// chatArchitectureData.js — same hand-placed concept-graph grammar, rendered by the
// SAME <ChatGraph> (cytoscape) component. Every node carries role/desc/src so a click
// reveals what it is and which real file it maps to. Facts are drawn from the actual
// code (cited in each `src`), so the diagram stays honest as the code changes.
//
// Where "How chat works" answers "who owns a turn", this answers the next question:
// "how does the autopilot drive a turn on its own — and what stops it?" It reuses the
// exact same machinery the chat map shows (TryBeginRun → CliRunnerService → claude),
// so those nodes are referenced lightly here; the new material is the engine, the
// host-only gate, the two drivers (classifier stub vs loop mode), and the fences.
//
// Groups (grp) / kinds / edge rels are the shared ChatGraph vocabulary:
//   grp:  client · backend · store · cli · auto · actor
//   kind: service(default) · db · proc · slot · actor
//   rel:  flow(default) · spawn · stream · read · reject

// ───────────────────────── 1 · SYSTEM MAP ─────────────────────────
// The whole autopilot subsystem: the operator's host PC (the only place that can open
// the gate) → the backend engine, decision brain and the SAME builder slot a chat uses
// → the CLI → the files on disk it both reads (the transcript) and writes (audit/state).
//
// COMPOUND (parent) boxes show WHERE each piece runs:
//   • tier boxes (box:'tier')  — host PC · backend :5099 · CLI · disk · web UI
//   • backend compartments (box:'sub') nested inside the backend tier
export const AUTOPILOT_MAP = {
  nodes: [
    // ---- tier containers (where it runs) ----
    { id: 'T_host', label: 'HOST PC · desktop app', box: 'tier', grp: 'actor',
      role: 'The operator at the host machine', desc: 'The WinForms window on the box that runs the harness. This tier is the ONLY place with authority to open the autopilot gate — nothing reachable over the web lives here.' },
    { id: 'T_backend', label: 'BACKEND · Kestrel :5099', box: 'tier', grp: 'backend',
      role: 'The harness process', desc: 'The long-lived server. The autopilot is a BackgroundService inside it — but it has no private path to the CLI; it drives turns through the same Run machinery a human chat does.' },
    { id: 'T_cli', label: 'CLI PROCESS', box: 'tier', grp: 'cli',
      role: 'The spawned claude process', desc: 'Exactly the process the "How chat works" map spawns — the autopilot reuses CliRunnerService, it does not launch claude itself.' },
    { id: 'T_disk', label: 'DISK · persistent', box: 'tier', grp: 'store',
      role: 'The filesystem under %APPDATA%\\ClaudeWeb + ~/.claude', desc: 'Outlives every process. Holds the gate/config/loop state the engine reads each tick, the append-only audit trail it writes, and the transcript it reads replies from.' },
    { id: 'T_web', label: 'WEB UI · your phone', box: 'tier', grp: 'client',
      role: 'The browser console', desc: 'The AutopilotConsole. It can READ all state and SHRINK authority (pause the kill switch, stop a loop) — but it can never OPEN the gate. That switch is host-only.' },

    // ---- backend compartments ----
    { id: 'B_http',   label: 'HTTP surface · gated', box: 'sub', grp: 'backend', p: 'T_backend',
      role: 'The web edge of the autopilot', desc: 'Every /api/autopilot endpoint passes through the operator gate first; with the gate off they all return 403.' },
    { id: 'B_engine', label: 'Engine · background', box: 'sub', grp: 'auto', p: 'T_backend',
      role: 'The tick loop + its state', desc: 'A hosted BackgroundService that wakes every 10s and, per repo, decides whether to drive a turn. Holds the gate singleton and the loop/config stores it consults.' },
    { id: 'B_brain', label: 'Decision · stub', box: 'sub', grp: 'auto', p: 'T_backend',
      role: 'Picks a prompt — or escalates', desc: 'The classifier path: a keyword matcher (NOT an LLM) that scores the last reply against your routine prompts, gated by a confidence threshold and the deny-list.' },
    { id: 'B_runs', label: 'Run ownership · slot', box: 'sub', grp: 'backend', p: 'T_backend',
      role: 'The single writer slot', desc: 'The same RunSessionService + builder slot a human chat claims. The autopilot calls the identical TryBeginRun, so it can never run concurrently with you on one repo.' },

    // ---- actor (outside every box) ----
    { id: 'operator', label: 'Operator · host PC', x: -120, y: 230, grp: 'actor', kind: 'actor',
      role: 'The human at the host machine',
      desc: 'The only one who can arm the autopilot at all. Clicks the Autopilot button in the desktop window; a steered web client or a prompt-injected agent cannot reach this.' },

    // ---- host tier ----
    { id: 'gatebtn', label: 'Autopilot ON/OFF button', x: 20, y: 230, grp: 'actor', p: 'T_host',
      role: 'The host-only master switch',
      desc: 'A WinForms button that calls AutopilotGate.Toggle(). Reflects state as "Autopilot: ON" (green) / "OFF" (grey). Enable/Disable are callable ONLY from here.',
      src: 'ClaudeWeb.App/UI/MainForm.cs' },

    // ---- web tier ----
    { id: 'console', label: 'AutopilotConsole.jsx', x: 20, y: 430, grp: 'client', p: 'T_web',
      role: 'The phone-facing console',
      desc: 'Polls GET /api/autopilot every 4s. If the gate is off it gets 403 and shows the "turned off by the operator" panel — with no button to turn it on, because the web can never grow gate authority.',
      src: 'client/src/components/autopilot/AutopilotConsole.jsx' },

    // ---- backend tier: HTTP ----
    { id: 'http', label: 'AutopilotController.cs', x: 300, y: -20, grp: 'backend', p: 'B_http',
      role: 'HTTP surface (all gated)',
      desc: 'GET /api/autopilot (state), /discover (mined routines), POST /config (arm/threshold/kill-switch/auto-advance), POST /loop (start|update|stop). Each calls GateClosed() first → 403 with gate="operator-off" when the gate is shut.',
      src: 'ClaudeWeb.App/Controllers/AutopilotController.cs' },

    // ---- backend tier: engine ----
    { id: 'gate', label: 'AutopilotGate', x: 250, y: 120, grp: 'auto', p: 'B_engine',
      role: 'The master switch (singleton)',
      desc: 'Defaults to OFF (secure by default). Enable()/Disable()/Toggle() are host-only — no controller can flip it. Both the tick AND every endpoint read it; state persists to disk.',
      src: 'ClaudeWeb.App/Services/Autopilot/AutopilotGate.cs' },
    { id: 'tick', label: 'AutopilotService tick', x: 430, y: 120, grp: 'auto', kind: 'proc', p: 'B_engine',
      role: 'The 10-second BackgroundService',
      desc: 'Each tick: gate off → idle and clear. Else per repo — an ACTIVE LOOP takes precedence (HandleLoop); otherwise classify the last reply. Sends only via TryBeginRun + CliRunnerService — the same path you use.',
      src: 'ClaudeWeb.App/Services/Autopilot/AutopilotService.cs' },
    { id: 'loopstore', label: 'LoopConfigStore', x: 250, y: 250, grp: 'backend', kind: 'db', p: 'B_engine',
      role: 'Per-repo loop state (loops.json)',
      desc: 'A LoopState per repo: Prompt, Sentinel (default "LOOP_DONE"), MaxIterations (default 10), Active, IterationsDone, Status, LastSentAt. RecordSend() bumps the counter on each resend.',
      src: 'ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs' },
    { id: 'cfg', label: 'AutopilotConfigStore', x: 430, y: 250, grp: 'backend', kind: 'db', p: 'B_engine',
      role: 'Global settings (autopilot.json)',
      desc: 'Enabled (kill switch, default on), AutoAdvance (actually send vs suggest, default off), Threshold (0.85), ArmedRepoIds, and the DenyList. The web can flip these — but only to SHRINK authority.',
      src: 'ClaudeWeb.App/Services/Autopilot/AutopilotConfigStore.cs' },
    { id: 'audit', label: 'AutopilotAuditLog', x: 340, y: 380, grp: 'auto', p: 'B_engine',
      role: 'Append-only record of every send',
      desc: 'On each auto-send the engine appends one line: at, repo, prompt, confidence, the message it answered, and outcome ("sent" for the classifier, "loop" for a loop resend). Suggestions are NOT audited — only real sends.',
      src: 'ClaudeWeb.App/Services/Autopilot/AutopilotAuditLog.cs' },

    // ---- backend tier: brain ----
    { id: 'brain', label: 'PromptClassifier · stub', x: 620, y: 110, grp: 'auto', p: 'B_brain',
      role: 'Keyword matcher (NOT an LLM)',
      desc: 'Scores the last reply by word-overlap against your routine prompts and returns a Verdict(Escalate, Label, Confidence, Reason). Below threshold → escalate; a deny-listed label → escalate even if confident. Still the Slice-2 stub.',
      src: 'ClaudeWeb.App/Services/Autopilot/PromptClassifier.cs' },
    { id: 'deny', label: 'deny-list', x: 620, y: 250, grp: 'backend', kind: 'slot', p: 'B_brain',
      role: 'The risky-word fence (shared)',
      desc: 'deploy · push · force · reset --hard · delete · drop · prod · overwrite · merge. Hit by a classifier label → escalate; hit in a loop reply → the loop escalates and stops. One fence, both drivers.',
      src: 'ClaudeWeb.App/Services/Autopilot/AutopilotConfigStore.cs' },

    // ---- backend tier: run ownership ----
    { id: 'runs', label: 'RunSessionService.cs', x: 300, y: 500, grp: 'backend', p: 'B_runs',
      role: 'Owner of every Run (shared)',
      desc: 'TryBeginRun(repoId, "builder") hands out ONE writer slot per repo. The autopilot claims the very same slot — if a human turn holds it, TryBeginRun returns false and the tick simply skips. No double-drive.',
      src: 'ClaudeWeb.App/Services/Chat/RunSessionService.cs' },
    { id: 'builder', label: 'builder slot', x: 480, y: 500, grp: 'backend', kind: 'slot', p: 'B_runs',
      role: 'The single writer lane',
      desc: 'One per repo. You, the classifier and loop mode all claim THIS slot via the same call — so they can never run concurrently on one agent. First caller wins.' },

    // ---- CLI + disk ----
    { id: 'claude', label: 'claude process', x: 400, y: 650, grp: 'cli', kind: 'proc', p: 'T_cli',
      role: 'The actual Claude Code CLI',
      desc: 'Spawned by CliRunnerService.RunAsync on the RunSession token — identical to a human turn. The autopilot adds no new way to launch it.' },
    { id: 'f_gate', label: 'autopilot-gate.json', x: 800, y: -20, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'Persisted gate state', desc: 'Survives restarts. Written only by AutopilotGate (host-driven).' },
    { id: 'f_cfg', label: 'autopilot.json', x: 800, y: 120, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'Persisted global settings', desc: 'Kill switch, auto-advance, threshold, armed set, deny-list.' },
    { id: 'f_loops', label: 'loops.json', x: 800, y: 260, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'Persisted per-repo loops', desc: 'Atomic temp+rename writes; never reseeded on an unreadable load.' },
    { id: 'f_audit', label: 'autopilot-audit.jsonl', x: 800, y: 400, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'Append-only send log', desc: 'Best-effort: write failures are logged, never thrown back into the tick.' },
    { id: 'f_jsonl', label: '~/.claude/…/<sid>.jsonl', x: 800, y: 540, grp: 'store', kind: 'db', p: 'T_disk',
      role: 'The transcript it reads', desc: 'The CLI writes the conversation here; the tick reads the LAST reply from this file to decide what (if anything) to send next. The autopilot is a reader of the same durable truth.' },
  ],
  edges: [
    { s: 'operator', t: 'gatebtn', label: 'clicks' },
    { s: 'gatebtn', t: 'gate', label: 'Enable / Disable · host-only', rel: 'spawn' },
    { s: 'gate', t: 'f_gate', label: 'persists' },
    { s: 'gate', t: 'tick', label: 'off → idle', rel: 'read' },
    { s: 'gate', t: 'http', label: 'fences every endpoint → 403', rel: 'reject' },
    { s: 'tick', t: 'loopstore', label: 'active loop? (precedence)', rel: 'read' },
    { s: 'loopstore', t: 'f_loops', label: 'loops.json' },
    { s: 'tick', t: 'brain', label: 'else: classify last reply' },
    { s: 'brain', t: 'cfg', label: 'threshold · armed', rel: 'read' },
    { s: 'cfg', t: 'f_cfg', label: 'autopilot.json' },
    { s: 'brain', t: 'deny', label: 'risky label → escalate', rel: 'reject' },
    { s: 'tick', t: 'runs', label: 'TrySend / TrySendLoop → TryBeginRun' },
    { s: 'runs', t: 'builder', label: 'claims writer slot' },
    { s: 'runs', t: 'claude', label: 'RunAsync · spawn detached', rel: 'spawn' },
    { s: 'claude', t: 'f_jsonl', label: 'append-only transcript' },
    { s: 'f_jsonl', t: 'tick', label: 'reads last reply', rel: 'read' },
    { s: 'tick', t: 'audit', label: 'records send / loop' },
    { s: 'audit', t: 'f_audit', label: 'append-only' },
    { s: 'console', t: 'http', label: 'GET state · POST config/loop (poll 4s)' },
  ],
};

// ───────────────────────── 2 · DECISION PER TURN (loop mode) ─────────────────────────
// The deterministic loop decision, in the EXACT order HandleLoop() runs it: errored →
// sentinel(done) → deny-list(escalate) → cap(capped) → else resend. Four of the five
// outcomes are terminal (the loop stops, Active=false); only "resend" continues.
export const LOOP_FLOW = {
  nodes: [
    { id: 'start', label: '① Tick · loop active', x: 0, y: 180, grp: 'auto', kind: 'proc',
      role: 'Gate on + Active loop on this repo',
      desc: 'An active loop takes precedence over the classifier entirely — the tick calls HandleLoop and never classifies.' },
    { id: 'read', label: '② Read last reply', x: 230, y: 180, grp: 'auto',
      role: 'From the JSONL transcript',
      desc: 'The same durable read source as the chat map. Everything below is decided from this one reply (and the run status).' },
    { id: 'c_err', label: 'errored?', x: 470, y: 60, grp: 'auto',
      role: 'run.Status == "error"',
      desc: 'First check. A crashed / cancelled run stops the loop immediately rather than hammering a broken agent.' },
    { id: 'error', label: '■ error', x: 700, y: -40, grp: 'actor',
      role: 'Resolve(repo, "error")', desc: 'Terminal. The loop stops and is handed back to you.' },
    { id: 'c_done', label: 'sentinel?', x: 470, y: 180, grp: 'auto',
      role: 'reply contains the Sentinel phrase',
      desc: 'Default "LOOP_DONE". The agreed "I am finished" signal — the intended happy ending of a loop.' },
    { id: 'done', label: '■ done', x: 700, y: 110, grp: 'store',
      role: 'Resolve(repo, "done")', desc: 'Terminal, success. The loop completed because the agent said the sentinel.' },
    { id: 'c_deny', label: 'deny-list hit?', x: 470, y: 300, grp: 'auto',
      role: 'risky word in the reply',
      desc: 'deploy · push · force · reset --hard · delete · drop · prod · overwrite · merge. The same fence the classifier uses.' },
    { id: 'escalate', label: '■ escalate', x: 700, y: 260, grp: 'actor', kind: 'actor',
      role: 'Resolve(repo, "escalate")', desc: 'Terminal. A risky reply is never auto-continued — the loop stops and waits for a human.' },
    { id: 'c_cap', label: 'cap reached?', x: 470, y: 420, grp: 'auto',
      role: 'IterationsDone >= MaxIterations',
      desc: 'The hard ceiling (default 10). Guarantees a loop can never run forever, even if the sentinel is never said.' },
    { id: 'capped', label: '■ capped', x: 700, y: 410, grp: 'cli',
      role: 'Resolve(repo, "capped")', desc: 'Terminal. The loop hit its iteration ceiling and stopped on its own.' },
    { id: 'resend', label: '③ Resend the prompt', x: 360, y: 540, grp: 'auto', kind: 'proc',
      role: 'TrySendLoop → TryBeginRun("builder")',
      desc: 'None of the stops fired → claim the slot, resend the fixed Prompt, RecordSend() bumps IterationsDone, and append an audit line with outcome="loop".' },
  ],
  edges: [
    { s: 'start', t: 'read' },
    { s: 'read', t: 'c_err', label: '1st' },
    { s: 'c_err', t: 'error', label: 'yes', rel: 'reject' },
    { s: 'c_err', t: 'c_done', label: 'no' },
    { s: 'c_done', t: 'done', label: 'yes' },
    { s: 'c_done', t: 'c_deny', label: 'no' },
    { s: 'c_deny', t: 'escalate', label: 'yes', rel: 'reject' },
    { s: 'c_deny', t: 'c_cap', label: 'no' },
    { s: 'c_cap', t: 'capped', label: 'yes' },
    { s: 'c_cap', t: 'resend', label: 'no → resend' },
    { s: 'resend', t: 'read', label: 'next tick · after the reply', rel: 'read' },
  ],
};
