// Understanding app: harness resource investigation, 2026-09-03. Build-less, relative URLs only.
(function () {
  const tabs = [
    ['crashes', '1 · Crashes'], ['chain', '2 · Mechanism'], ['load', '3 · Load sources'], ['fixes', '4 · Five fixes'], ['sim', '5 · Simulator'],
  ];
  const nav = document.getElementById('nav');
  for (const [id, label] of tabs) {
    const b = document.createElement('button'); b.textContent = label; b.dataset.id = id;
    b.onclick = () => show(id); nav.appendChild(b);
  }
  function show(id) {
    document.querySelectorAll('section').forEach((s) => s.classList.toggle('on', s.id === id));
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    location.hash = id;
  }
  show((location.hash || '#crashes').slice(1));

  // 1. Timeline of crashes + deploys (local time).
  const events = [
    ['2026-09-02 08:08', 'crash', 'Unexpected shutdown, no bugcheck recorded (hard hang or power event).'],
    ['2026-09-02 08:18', 'deploy', 'swap.ps1 deploy (rollback armed, then kept).'],
    ['2026-09-02 12:52', 'deploy', 'swap.ps1 deploy.'],
    ['2026-09-02 13:12', 'run', 'A birocode agent turn starts (build-heavy).'],
    ['2026-09-02 13:13', 'crash', 'Bugcheck 0x3B SYSTEM_SERVICE_EXCEPTION (c0000005 access violation in kernel).'],
    ['2026-09-03 12:24', 'run', 'Agent turn: vite build + dotnet build + Playwright + swap (16 min).'],
    ['2026-09-03 12:26', 'deploy', 'swap.ps1 deploy #1 (kept 12:27).'],
    ['2026-09-03 12:36', 'deploy', 'swap.ps1 deploy #2 (kept 12:36).'],
    ['2026-09-03 12:39', 'crash', 'Bugcheck 0x1E KMODE_EXCEPTION_NOT_HANDLED. Minidump stack: ntoskrnl ← FLTMGR ← WdFilter.'],
    ['2026-09-03 12:44', 'deploy', 'Harness restarted after reboot (rollback armed).'],
    ['2026-09-03 12:51', 'crash', 'Bugcheck 0xE3 RESOURCE_NOT_OWNED. Minidump stack: WdFilter ← FLTMGR ← ntoskrnl.'],
    ['2026-09-03 12:56', 'deploy', 'Harness restarted after reboot; investigation starts.'],
  ];
  const tl = document.getElementById('tl');
  for (const [when, kind, text] of events) {
    const d = document.createElement('div'); d.className = `ev ${kind}`;
    d.innerHTML = `<div class="when">${when}</div><div>${kind === 'crash' ? '<b style="color:var(--bad)">CRASH</b> · ' : kind === 'deploy' ? '<b style="color:var(--warn)">deploy</b> · ' : ''}${text}</div>`;
    tl.appendChild(d);
  }

  // 2. The mechanism chain.
  const chain = [
    ['A browser has the Chat (or Dashboard) page open', 'ChatContext runs a 5 s "reconcile": GET /api/runs, then for every running repo it calls attachToRun. Dashboard.jsx does worse: it fetches the FULL transcript of every visible dock every 5 s (client/src/pages/Dashboard.jsx:838).', false],
    ['attachToRun sees a "fresh" conversation', 'If the local copy has ≤ 1 message it calls loadTranscript → GET /api/sessions/{id}/messages (client/src/context/ChatContext.jsx:496). While a 249 MB load is in flight (> 1 s) the next reconcile arrives and the copy still looks fresh, so it is requested again.', false],
    ['The backend parses the whole .jsonl from byte 0', 'SessionService.GetMessages does File.ReadLines + JsonDocument.Parse per line, no cache, no size/mtime check (ClaudeWeb.App/Services/Chat/SessionService.cs:143). It then reads the whole autopilot-audit.jsonl too (ChatController.cs:348).', false],
    ['249 MB × 12 per minute', '127 000 4 KB reads per 10 s measured. Every open/read/close passes through FLTMGR → WdFilter (Defender real-time scan), on a file claude.exe is appending to concurrently.', true],
    ['Add a deploy or a build-heavy turn', 'vite writes thousands of files, dotnet build + Roslyn, robocopy /MIR of run-bin, Playwright Chromium profile. All through the same filter, on a 2020 kernel.', true],
    ['WdFilter faults in kernel mode', '0x1E / 0x3B / 0xE3 bugchecks with WdFilter on the stack. The box reboots. The dead-man rollback timer was NOT the trigger: the scheduler log shows every ClaudeWebAutoRollback task deleted before it fired.', true],
  ];
  const ch = document.getElementById('chain');
  chain.forEach(([t, d, bad], i) => {
    const s = document.createElement('div'); s.className = `step${bad ? ' bad' : ''}`;
    s.innerHTML = `<div class="n">${i + 1}</div><div><div class="t">${t}</div><div class="d">${d}</div></div>`;
    s.onclick = () => s.classList.toggle('open'); ch.appendChild(s);
    if (i < chain.length - 1) { const a = document.createElement('div'); a.className = 'arrow'; a.textContent = '↓'; ch.appendChild(a); }
  });

  // 3. Load sources (MB/hour read or processes/hour), relative bars.
  const sources = [
    ['Chat/Dashboard transcript poll (this session, 249 MB, every 5–6 s)', 150000, 'MB/h', 'measured', 'ChatContext.jsx:646 + Dashboard.jsx:838 → SessionService.GetMessages'],
    ['Autopilot discovery mining: every transcript of every repo, twice, every 5 min', 18000, 'MB/h', 'estimated (747 MB tree × 2 × 12)', 'AutopilotService.cs:168 → AutopilotDiscoveryService.cs:72'],
    ['Autopilot tick: full transcript re-read per armed loop every 10 s', 3600, 'MB/h', 'estimated (10 MB transcript)', 'AutopilotService.cs:944 → GetMessages'],
    ['Arch tab: /arch + /arch/messages + /arch/tool-calls every 3 s, no hidden guard', 1200, 'MB/h', 'estimated', 'Arch.jsx:115, ArchHistoryPanel.jsx:307'],
    ['gh.exe spawns for the account chip (2 per 10 s) + GitHub API call', 720, 'procs/h', 'measured (53 probes / 10.5 min)', 'GitHubAccountService.cs:26 (5 s cache) ← AccountChips.jsx:48'],
    ['Arch loop tick: 9–17 git.exe per managed repo every 10 s', 36000, 'procs/h', 'estimated (10 repos)', 'ArchAgentService.cs:1156 → GitService.Status'],
    ['Logger: open+write+close per log line, global lock', 30000, 'opens/h', 'estimated', 'Logger.cs:44'],
  ];
  const lb = document.getElementById('loadbars');
  const maxMB = Math.max(...sources.filter((s) => s[2] === 'MB/h').map((s) => s[1]));
  for (const [name, v, unit, how, where] of sources) {
    const pct = unit === 'MB/h' ? (v / maxMB) * 100 : Math.min(100, (v / 36000) * 100);
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><b>${name}</b><span class="mono">${v.toLocaleString()} ${unit}</span></div>
      <div class="bar${unit === 'MB/h' ? ' bad' : ''}" style="margin:6px 0"><i style="width:${pct}%"></i></div>
      <div class="soft"><span class="pill">${how}</span> <span class="mono">${where}</span></div>`;
    lb.appendChild(d);
  }

  // 4. The five optimizations — IMPLEMENTED 2026-09-03 on feature/reduce-transcript-io
  // (openspec change reduce-transcript-io). Each card: what was proposed → what shipped.
  const opts = [
    ['1. Cache transcripts server-side and parse only the tail', 'DONE · TranscriptCache.cs + TranscriptAccumulators.cs · 9 unit tests',
      'SessionService now reads every transcript through a per-file incremental cache: the file is opened (length and mtime taken through the open handle, because the directory entry lags for a file the CLI holds open), and if nothing changed the cached result is returned; if it grew, only the appended bytes are parsed, whole lines only — a line the CLI is still writing waits for its newline; if it shrank or was rewritten in place (the NUL repair), it starts over. Messages, tool calls, the arch tool-call history and the session list all use it. The autopilot send-audit is held in memory too, so the actor annotation no longer re-reads its file per request.'],
    ['2. Stop the clients re-downloading whole transcripts', 'DONE · GET /api/sessions/activity · ChatContext in-flight guard · Arch pollers gated',
      'The dashboard asks for one batch digest per tick (latest assistant line + newest user timestamp + count, computed from the cache) instead of one full transcript per visible dock. ChatContext shares a pending transcript load per conversation, so the 5 s reconcile cannot issue a second GET while the first is still streaming megabytes. The Arch page polls the transcript only on its Chat lane, and all three Arch pollers skip hidden tabs.'],
    ['3. Make autopilot mining incremental', 'DONE · per-file contribution cache in AutopilotDiscoveryService',
      'The 5-minute discovery pass keeps what each transcript contributed (its routine-prompt keys and sample snippets) keyed by the file\'s length and mtime, re-parses only files that changed, and drops files that vanished. The session list it starts from is cached the same way. The 10 s tick\'s "last assistant message" read rides the transcript cache from fix 1, which is strictly cheaper than a backwards tail read: a stat when nothing changed, a delta when something did.'],
    ['4. Cache git status and throttle process spawning', 'DONE · GitService.Status memo 5 s + semaphore(4) · gh cache 5 min',
      'GitService.Status without fetch serves a 5 s memo per working directory with single-flight (concurrent callers share one computation); any mutating git command through the service invalidates it; a fetch call bypasses and refreshes it. git.exe launches go through a 4-slot semaphore. The arch agent memoizes each repo\'s remote URL for a minute. The GitHub account chip cache went from 5 s to 5 min (Refresh() still forces a probe after a login) and the Claude account probe from 5 s to 1 min.'],
    ['5. Open log handles instead of open/append/close per line', 'DONE · Logger + AuditService keep the writer · dock/loops rewrites left alone',
      'The harness logger and the audit service hold one shared-read writer per file and re-open it after a failed write, so a burst of lines is one open, not hundreds of trips through the filter driver. The dock.json / loops.json / devices.json rewrites turned out to be event-driven (per click, per run start), not periodic, so they were measured as not part of the churn and left as they are.'],
  ];
  const op = document.getElementById('opts');
  for (const [h, meta, body] of opts) {
    const d = document.createElement('div'); d.className = 'card opt';
    d.innerHTML = `<h3>${h}</h3><div class="meta">${meta}</div><div>${body}</div>`;
    op.appendChild(d);
  }
  // The A/B measurement (task 4.3): two isolated instances, the real 262 MB
  // transcript bound to a dock, dashboard overlay open for 20 s.
  const ab = document.getElementById('ab');
  if (ab) {
    const rows = [
      ['Build', 'Bytes read in 20 s', 'Read operations', 'Transcript GETs', 'Batch digest GETs'],
      ['old (live 12:56 build)', '997 MB', '255,124', '4 (12.9 MB over the wire)', '0'],
      ['new (this branch)', '0 MB', '0', '0', '4'],
    ];
    ab.innerHTML = rows.map((r, i) => `<tr>${r.map((c) => i === 0 ? `<th>${c}</th>` : `<td class="mono">${c}</td>`).join('')}</tr>`).join('');
  }

  // 5. Simulator.
  const $ = (id) => document.getElementById(id);
  function sim() {
    const size = +$('s-size').value, poll = +$('s-poll').value, tabs = +$('s-tabs').value;
    $('v-size').textContent = `${size} MB`; $('v-poll').textContent = `${poll} s`; $('v-tabs').textContent = String(tabs);
    const perHourNow = (3600 / poll) * size * tabs; // MB
    const gbNow = perHourNow / 1024;
    $('r-now').textContent = gbNow >= 1 ? `${gbNow.toFixed(1)} GB / hour` : `${perHourNow.toFixed(0)} MB / hour`;
    $('r-now2').textContent = `${((3600 / poll) * tabs).toFixed(0)} full parses per hour · ~${(size * 1.24 / 249).toFixed(2)} s server time each`;
    // After: one stat + delta read per poll. Assume a live session appends ~40 KB per 5 s.
    const delta = 0.04 * (poll / 5);
    const perHourAfter = (3600 / poll) * delta * tabs;
    $('r-after').textContent = `${perHourAfter.toFixed(1)} MB / hour`;
    $('r-after2').textContent = `one 4 KB stat + the appended lines per poll · full parse only once at page load`;
  }
  ['s-size', 's-poll', 's-tabs'].forEach((id) => $(id).addEventListener('input', sim));
  sim();
})();
