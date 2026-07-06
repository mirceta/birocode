/* Self-dev deploy Understanding app — vanilla JS, no deps. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  /* ---------- tabs ---------- */
  const tabs = document.querySelectorAll('#tabs button');
  tabs.forEach((b) =>
    b.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.view').forEach((v) =>
        v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    }));

  /* ---------- view 1: process-tree demo ---------- */
  const nHarness = $('n-harness'), nSession = $('n-session'),
        nSwap = $('n-swap'), nTask = $('n-task'), cap = $('tree-caption');
  let treeTimers = [];
  function clearTree() {
    treeTimers.forEach(clearTimeout); treeTimers = [];
    [nHarness, nSession, nSwap, nTask].forEach((n) =>
      n.classList.remove('dead', 'reborn', 'working'));
    nTask.classList.add('hidden');
    nSwap.classList.remove('hidden');
    cap.innerHTML = "swap.ps1's job includes <strong>stopping the harness</strong> before swapping binaries…";
  }
  function later(ms, fn) { treeTimers.push(setTimeout(fn, ms)); }

  $('btn-naive').addEventListener('click', () => {
    clearTree();
    nSwap.classList.add('working');
    cap.textContent = 'swap.ps1 builds, stages… then reaches "stop the live harness".';
    later(1400, () => {
      nHarness.classList.add('dead');
      cap.textContent = 'Harness stopped — but the whole process tree hangs off it…';
    });
    later(2600, () => {
      nSession.classList.add('dead'); nSwap.classList.add('dead');
      nSwap.classList.remove('working');
      cap.innerHTML = '☠️ The Claude session and the <strong>half-finished swap die too</strong>. Nobody restarts live. This is the suicide problem.';
    });
  });

  $('btn-task').addEventListener('click', () => {
    clearTree();
    nTask.classList.remove('hidden');
    nTask.classList.add('working');
    cap.innerHTML = '<code>schtasks /Run ClaudeWebManualDeploy</code> — the wrapper starts <strong>outside</strong> the harness tree.';
    later(1400, () => {
      nHarness.classList.add('dead'); nSession.classList.add('dead');
      nSwap.classList.add('hidden');
      cap.textContent = 'Wrapper stops the harness. The Claude session blips — but the wrapper keeps running.';
    });
    later(2800, () => {
      nHarness.classList.remove('dead'); nHarness.classList.add('reborn');
      cap.textContent = 'Wrapper swaps binaries and restarts the harness with the NEW build…';
    });
    later(4200, () => {
      nSession.classList.remove('dead'); nSession.classList.add('reborn');
      nTask.classList.remove('working');
      cap.innerHTML = '✅ Health 200 → keep.ps1 disarms the rollback. The session resumes and verifies the logs — exactly what happened tonight.';
    });
  });
  $('btn-reset-tree').addEventListener('click', clearTree);

  /* ---------- view 2: pipeline ---------- */
  const STAGES = [
    { t: 'Dry run', safety: true,
      d: 'swap.ps1 -DryRun — validates the origin/main guard and does the FULL build (npm + dotnet) into the stage dir, but never touches live. Tonight: guard OK, 0 errors. It also pre-warms the build cache, which is why the real swap took only ~29 s.',
      c: 'powershell.exe -NoProfile -File swap.ps1 -DryRun\n# … Build succeeded. 0 Error(s)\n# DRY RUN: build + guard validated; NOT stopping/swapping/restarting live.' },
    { t: 'Start task',
      d: 'Register-ScheduledTask was denied (0x80070005, shell not elevated), but ClaudeWebManualDeploy persisted from the last deploy — starting an existing task you own needs no elevation. schtasks /Run launches deploy-keep-wrapper.ps1 outside the harness tree, RunLevel Highest.',
      c: 'schtasks /Run /TN ClaudeWebManualDeploy\n# SUCCESS: Attempted to run the scheduled task.' },
    { t: 'Guard',
      d: 'swap.ps1 refuses to deploy anything but a clean checkout of origin/main — no local commits, no dirty tree. Machine-independent: it resolves every path from its own location.' },
    { t: 'Build + stage', safety: true,
      d: 'Stage-before-stop: the frontend (client/dist) and dotnet publish are built into a staging dir while live keeps serving. If the build fails, live was never touched.' },
    { t: 'Snapshot',
      d: 'The current live build is mirrored to run-bin.lastgood with robocopy /MIR — this is what a rollback restores.' },
    { t: 'Stop live',
      d: 'The elevated wrapper kills the (elevated) harness PID. This is the moment the Claude session dies — and why the wrapper must live outside the tree.' },
    { t: 'Swap + restart',
      d: 'Staged build is swapped into the standard run dir, preserving logs/ and appsettings.json, then the harness is relaunched on :5099.' },
    { t: 'Arm rollback', safety: true,
      d: 'A 15-minute dead-man task (rollback.ps1) is armed with a real DateTime trigger (never schtasks /SD — locale bug). If nothing disarms it, live auto-restores to run-bin.lastgood.' },
    { t: 'Health probe', safety: true,
      d: 'The wrapper polls http://localhost:5099/api/auth/check up to 20× every 2 s. Tonight: 200 on the first probe.',
      c: "for ($i = 0; $i -lt 20; $i++) {\n  $r = Invoke-WebRequest 'http://localhost:5099/api/auth/check'\n  if ($r.StatusCode -eq 200) { $ok = $true; break }\n}" },
    { t: 'keep.ps1', safety: true,
      d: 'Only on a 200 does the wrapper run keep.ps1, deleting the dead-man task. A broken deploy is never disarmed — it silently rolls back instead. Tonight: kept at 23:54:42, ClaudeWebDeadman confirmed gone.' },
  ];
  const pipe = $('pipe');
  STAGES.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'stage' + (s.safety ? ' safety' : '');
    el.innerHTML = '<span class="n">' + (i + 1) + (s.safety ? ' · safety' : '') + '</span>' + s.t;
    el.addEventListener('click', () => selectStage(i));
    pipe.appendChild(el);
  });
  function selectStage(i) {
    pipe.querySelectorAll('.stage').forEach((el, j) => el.classList.toggle('sel', j === i));
    const s = STAGES[i];
    $('sd-title').textContent = (i + 1) + ' · ' + s.t;
    $('sd-body').textContent = s.d;
    const pre = $('sd-code');
    if (s.c) { pre.textContent = s.c; pre.classList.remove('hidden'); }
    else pre.classList.add('hidden');
  }
  let walkTimer = null;
  $('btn-walk').addEventListener('click', () => {
    clearInterval(walkTimer);
    let i = 0;
    pipe.querySelectorAll('.stage').forEach((el) => el.classList.remove('lit'));
    selectStage(0); pipe.children[0].classList.add('lit');
    walkTimer = setInterval(() => {
      i++;
      if (i >= STAGES.length) { clearInterval(walkTimer); return; }
      selectStage(i); pipe.children[i].classList.add('lit');
    }, 2200);
  });
  selectStage(0);

  /* ---------- view 3: dead-man simulator ---------- */
  const clock = $('dm-clock'), fuse = $('dm-fuse'), dmLog = $('dm-log');
  let dmTimer = null;
  function dmSay(text, cls) {
    const d = document.createElement('div');
    d.className = 'dm-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    dmLog.appendChild(d);
    dmLog.scrollTop = dmLog.scrollHeight;
  }
  function dmReset() {
    clearInterval(dmTimer);
    clock.textContent = '15:00';
    clock.classList.remove('safe', 'boom');
    fuse.style.width = '100%';
    dmLog.innerHTML = '<div class="dm-line dim">swap complete — rollback armed, probing http://localhost:5099/api/auth/check …</div>';
  }
  function dmBurn(healthy) {
    dmReset();
    let secs = 900;                 // simulated seconds; runs at ~90x speed
    dmTimer = setInterval(() => {
      secs -= 10;
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      clock.textContent = m + ':' + s;
      fuse.style.width = (secs / 900 * 100) + '%';

      if (healthy && secs === 880) {
        dmSay('probe #1 … HTTP 200', 'ok');
        dmSay('health 200 → running keep.ps1 (disarm)', 'ok');
        dmSay('keep.ps1: dead-man task deleted. Deploy KEPT.', 'ok');
        clearInterval(dmTimer);
        clock.classList.add('safe');
        clock.textContent = 'KEPT';
        fuse.style.width = '0%';
      }
      if (!healthy) {
        if (secs === 880) dmSay('probe #1 … no response', 'bad');
        if (secs === 860) dmSay('probe #10 … connection refused', 'bad');
        if (secs === 840) dmSay('20 probes exhausted → HEALTH FAILED → NOT disarming', 'bad');
        if (secs === 820) dmSay('fuse keeps burning — nobody confirms the build…', 'dim');
        if (secs <= 0) {
          clearInterval(dmTimer);
          clock.classList.add('boom');
          clock.textContent = '00:00';
          dmSay('⏰ rollback.ps1 fires: robocopy /MIR run-bin.lastgood → live, restart harness', 'bad');
          dmSay('live restored to last-good build. No operator needed.', 'ok');
        }
      }
    }, 60);
  }
  $('dm-healthy').addEventListener('click', () => dmBurn(true));
  $('dm-broken').addEventListener('click', () => dmBurn(false));
  $('dm-reset').addEventListener('click', dmReset);

  /* ---------- view 4: replay ---------- */
  const EVENTS = [
    { t: '23:49', w: 'PR #21 merged on GitHub; local main fast-forwarded to d3384f2 (= origin/main).', n: 'the guard requires exactly this state' },
    { t: '23:53', w: 'swap.ps1 -DryRun — guard OK, full build staged, 0 errors.', n: 'live untouched; build cache pre-warmed', good: true },
    { t: '23:54:0x', w: 'Register-ScheduledTask denied (0x80070005) — shell not elevated.', n: 'expected: registering RunLevel-Highest needs admin', bad: true },
    { t: '23:54:0x', w: 'ClaudeWebManualDeploy found intact from the last deploy → schtasks /Run.', n: 'starting an owned task needs no elevation', good: true },
    { t: '23:54:13', w: 'wrapper: starting swap.ps1', n: 'deploy-keep-wrapper.log' },
    { t: '23:54:~30', w: 'Harness on :5099 stopped, swapped, restarted — this Claude session dropped and resumed.', n: 'the watcher shell died with it (expected)' },
    { t: '23:54:42', w: 'wrapper: swap.ps1 returned, probing health → 200 on first probe', good: true },
    { t: '23:54:42', w: 'wrapper: keep.ps1 done. deploy kept.', n: 'dead-man task deleted', good: true },
    { t: 'after', w: 'Session verification: /api/auth/check → 200; ClaudeWebDeadman task not found.', n: 'live confirmed on the new build', good: true },
  ];
  const tl = $('timeline');
  EVENTS.forEach((e) => {
    const d = document.createElement('div');
    d.className = 'tl-item' + (e.good ? ' good' : '') + (e.bad ? ' bad' : '');
    d.innerHTML = '<div class="tl-time">' + e.t + '</div><div class="tl-what">' + e.w + '</div>'
      + (e.n ? '<div class="tl-note">' + e.n + '</div>' : '');
    tl.appendChild(d);
  });
  let replayTimer = null;
  function replay() {
    clearInterval(replayTimer);
    const items = tl.querySelectorAll('.tl-item');
    items.forEach((x) => x.classList.remove('on'));
    $('replay-verdict').classList.add('hidden');
    let i = 0;
    items[0].classList.add('on');
    replayTimer = setInterval(() => {
      i++;
      if (i >= items.length) {
        clearInterval(replayTimer);
        $('replay-verdict').classList.remove('hidden');
        return;
      }
      items[i].classList.add('on');
    }, 700);
  }
  $('btn-replay').addEventListener('click', replay);
  // show everything statically until replayed
  tl.querySelectorAll('.tl-item').forEach((x) => x.classList.add('on'));
})();
