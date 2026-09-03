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

  // 4. The five optimizations.
  const opts = [
    ['1. Cache transcripts server-side and parse only the tail', 'Removes ~95 % of the measured disk reads. Effort: small.',
      'In SessionService keep a per-file cache keyed by (path, length, mtime). On a poll, if the file only grew, seek to the old length and parse the new lines; if it is unchanged, return the cached list. Apply the same to GetToolCallHistory, GetToolCalls and the AutopilotAuditLog.Recent read. One 249 MB parse becomes one 4 KB read per poll.'],
    ['2. Stop the clients re-downloading whole transcripts', 'Removes the remaining reload storm and 3.4 MB responses per poll. Effort: small.',
      'ChatContext: mark a conversation as "transcript requested" per sessionId (an in-flight guard) so the 5 s reconcile never re-requests it while a load is pending, and never once it has loaded. Dashboard: replace the per-dock /messages fetch with a summary field on /api/runs (latest activity + last user timestamp), which the backend already knows from the run buffer. Arch page: stop /arch/messages when the Chat lane is hidden, add document.hidden guards to all three Arch pollers.'],
    ['3. Make autopilot mining incremental and off the transcript path', 'Removes the 750 MB × 2 full-tree parse every 5 minutes. Effort: medium.',
      'Discover() parses each transcript twice (ListSessions then GetMessages). Reuse the cache from fix 1, skip files whose (length, mtime) has not changed since the last pass, and cap the pass to sessions modified in the last N days. For the 10 s tick, read the last assistant message by seeking backwards from the end of the file instead of parsing the whole thing.'],
    ['4. Cache git status and throttle process spawning', 'Removes tens of thousands of git.exe and gh.exe launches per hour. Effort: small.',
      'GitService.Status: memoize per repo path with a 5 s TTL and single-flight (one concurrent status per repo). ArchAgentService.LocalAgents and GET /api/arch share it. Raise the gh account cache from 5 s to 5 min (it is a chip, not a control), and drop the second gh call (auth status) unless the login changed. Add a global semaphore for git.exe so a dashboard refresh cannot fan out to 100 processes.'],
    ['5. Buffered logging and fewer whole-file rewrites', 'Removes ~30 000 file open/close cycles per hour through Defender and a lock convoy. Effort: small.',
      'Logger: hold one StreamWriter (AutoFlush or a 250 ms drain) instead of File.AppendAllText per line, and roll the file at midnight. Demote the per-tool-call and per-git-status Info lines to Debug. AuditService: same writer pattern. dock.json / loops.json / devices.json: debounce rewrites (250 ms coalesce) and always write temp + move.'],
  ];
  const op = document.getElementById('opts');
  for (const [h, meta, body] of opts) {
    const d = document.createElement('div'); d.className = 'card opt';
    d.innerHTML = `<h3>${h}</h3><div class="meta">${meta}</div><div>${body}</div>`;
    op.appendChild(d);
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
