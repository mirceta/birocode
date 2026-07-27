/* Understanding app — deploy pipeline + dead-man's switch.
   Build-less, no deps. Mirrors the actual swap.ps1 / keep.ps1 run from this session. */
(function () {
  'use strict';

  // ---- Pipeline stages (verbatim shape of the deploy log this session) ----
  var STAGES = [
    { ico: '🛡️', t: 'Guard', crit: true,
      log: ['guard: git fetch origin', 'guard OK: HEAD contains origin/main'] },
    { ico: '🏗️', t: 'Build', crit: false,
      log: ['build: npm --prefix client run build'] },
    { ico: '📦', t: 'Stage', crit: false,
      log: ['stage OK: full build present'] },
    { ico: '⏹️', t: 'Stop', crit: false,
      log: ['live: PID 33312 serving from run-bin', 'stop: killing PID 33312 on :5099'] },
    { ico: '📸', t: 'Snapshot', crit: true,
      log: ['snapshot: mirror run-bin -> run-bin.lastgood', 'snapshot OK: last-good captured'] },
    { ico: '🔀', t: 'Swap', crit: false,
      log: ['swap: robocopy staged -> run-bin (keep logs/ + appsettings.json)'] },
    { ico: '🚀', t: 'Restart + health', crit: false,
      log: ['restart: launched ClaudeWeb.exe', 'health: 200 on :5099'] },
    { ico: '⏱️', t: 'Arm rollback', crit: true,
      log: ['armed: ClaudeWebAutoRollback fires 14:58 (15 min)',
            'DEAD-MAN SWITCH ARMED — say "keep it" (keep.ps1) to disarm'] }
  ];

  var flow = document.getElementById('flow');
  var cons = document.getElementById('console');
  var stageLabel = document.getElementById('stagelabel');
  var playBtn = document.getElementById('play');
  var stepBtn = document.getElementById('step');
  var resetBtn = document.getElementById('reset');

  // Build the step cards
  STAGES.forEach(function (s, i) {
    var el = document.createElement('div');
    el.className = 'step' + (s.crit ? ' crit' : '');
    el.id = 'st' + i;
    el.innerHTML = '<div class="n">' + (i + 1) + '/8</div>' +
      '<div class="ico">' + s.ico + '</div><div class="t">' + s.t + '</div>';
    flow.appendChild(el);
  });

  var cur = -1;        // index of last-activated stage
  var timer = null;
  var baseTs = 14 * 3600 + 43 * 60 + 6; // 14:43:06 start, seconds since midnight

  function fmt(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function render() {
    STAGES.forEach(function (s, i) {
      var el = document.getElementById('st' + i);
      el.classList.remove('active', 'done');
      if (i < cur) el.classList.add('done');
      else if (i === cur) el.classList.add('active');
    });
  }

  function writeConsole() {
    if (cur < 0) { cons.textContent = 'Idle. Press ▶ Play deploy.'; return; }
    var html = '';
    var t = baseTs;
    for (var i = 0; i <= cur; i++) {
      STAGES[i].log.forEach(function (line, k) {
        var cls = /OK|200|captured|present|contains/.test(line) ? 'ok'
          : /ARMED|armed|fires/.test(line) ? 'arm' : '';
        html += '<span class="ts">2026-07-27T' + fmt(t).slice(0, 8) + '</span>  ' +
          '<span class="' + cls + '">' + esc(line) + '</span>\n';
        t += (i === cur ? 0 : 1) + k;
      });
      t += 2;
    }
    cons.innerHTML = html;
    cons.scrollTop = cons.scrollHeight;
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function advance() {
    if (cur >= STAGES.length - 1) { stop(); return; }
    cur++;
    stageLabel.textContent = 'Stage ' + (cur + 1) + '/8 — ' + STAGES[cur].t;
    render(); writeConsole();
    if (cur === STAGES.length - 1) {
      stop();
      stageLabel.innerHTML = '✅ Deploy finished — <b style="color:var(--warn)">switch armed, 15 min on the clock</b>';
    }
  }

  function play() {
    if (timer) return;
    if (cur >= STAGES.length - 1) reset();
    playBtn.textContent = '⏸ Running…'; playBtn.disabled = true;
    timer = setInterval(advance, 850);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playBtn.textContent = '▶ Play deploy'; playBtn.disabled = false;
  }
  function reset() {
    stop(); cur = -1; stageLabel.textContent = ''; render(); writeConsole();
  }

  playBtn.onclick = play;
  stepBtn.onclick = function () { stop(); advance(); };
  resetBtn.onclick = reset;
  render();

  // -------------------- Dead-man switch clock --------------------
  var CIRC = 2 * Math.PI * 78; // ~490
  var arc = document.getElementById('arc');
  var slider = document.getElementById('slider');
  var clockTime = document.getElementById('clockTime');
  var clockCap = document.getElementById('clockCap');
  var verdict = document.getElementById('verdict');
  var outcome = document.getElementById('outcome');
  var keepBtn = document.getElementById('keepBtn');
  var letBtn = document.getElementById('letBtn');
  arc.style.strokeDasharray = CIRC;

  var elapsed = 0;      // seconds elapsed within the 900s window
  var decided = null;   // 'keep' | 'roll' | null
  var swTimer = null;

  function paintClock() {
    var remain = Math.max(0, 900 - elapsed);
    var mm = Math.floor(remain / 60), ss = remain % 60;
    clockTime.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    var frac = remain / 900;
    arc.style.strokeDashoffset = CIRC * (1 - frac);
    // colour shifts warn -> bad as it runs down
    var col = decided === 'keep' ? 'var(--good)'
      : remain <= 0 ? 'var(--bad)'
      : remain < 180 ? 'var(--bad)' : 'var(--warn)';
    arc.setAttribute('stroke', col);
    slider.value = elapsed;
  }

  function setVerdict() {
    if (decided === 'keep') {
      clockCap.textContent = 'DISARMED';
      verdict.style.color = 'var(--good)';
      verdict.innerHTML = '✓ keep.ps1 ran — switch off, build permanent';
      outcome.className = 'outcome keep';
      outcome.innerHTML = '<h4 style="color:var(--good)">✓ Kept</h4>' +
        '<p class="muted" style="margin:0;font-size:12.5px">' +
        '<code>keep.ps1</code> deleted <code>ClaudeWebAutoRollback</code>. ' +
        'No rollback will ever fire. The new build (PID 20324) stays live.<br>' +
        '<span style="color:var(--warn)">The trailing “cannot find the file” is the <b>verify</b> query ' +
        'confirming the task is gone — not a failure.</span></p>';
      return;
    }
    if (decided === 'roll') {
      clockCap.textContent = 'ROLLED BACK';
      verdict.style.color = 'var(--bad)';
      verdict.innerHTML = '↺ Timer won — rollback.ps1 restored last-good';
      outcome.className = 'outcome roll';
      outcome.innerHTML = '<h4 style="color:var(--bad)">↺ Auto-rolled back</h4>' +
        '<p class="muted" style="margin:0;font-size:12.5px">' +
        'No “keep it” arrived in 15 min. <code>rollback.ps1</code> <code>robocopy /MIR</code>d ' +
        '<code>run-bin.lastgood</code> over <code>run-bin</code> and restarted. ' +
        'Live is back on the previous build — <b>no operator needed.</b></p>';
      return;
    }
    // undecided / live
    var remain = 900 - elapsed;
    clockCap.textContent = 'UNTIL ROLLBACK';
    if (remain <= 0) { decided = 'roll'; setVerdict(); paintClock(); return; }
    verdict.style.color = 'var(--warn)';
    verdict.innerHTML = '⏳ Armed — ' + Math.ceil(remain / 60) + ' min left to say “keep it”';
    outcome.className = 'outcome';
    outcome.innerHTML = '<h4>Two ways out</h4>' +
      '<p class="muted" style="margin:0;font-size:12.5px">' +
      '<b>keep.ps1</b> deletes the task — build stays.<br>' +
      '<b>timeout</b> → <code>rollback.ps1</code> restores <code>run-bin.lastgood</code>. No operator.</p>';
  }

  function stopSw() { if (swTimer) { clearInterval(swTimer); swTimer = null; } }

  slider.oninput = function () {
    stopSw();
    if (decided) return; // locked once decided
    elapsed = parseInt(slider.value, 10);
    paintClock(); setVerdict();
  };

  keepBtn.onclick = function () {
    stopSw(); decided = 'keep';
    // freeze the clock wherever it is
    paintClock(); setVerdict();
  };

  letBtn.onclick = function () {
    if (decided) return;
    stopSw();
    letBtn.textContent = '⏱ running…';
    swTimer = setInterval(function () {
      elapsed = Math.min(900, elapsed + 30); // 30s per tick, fast-forward
      paintClock(); setVerdict();
      if (elapsed >= 900) { stopSw(); letBtn.textContent = '⏱ let timer run'; }
    }, 120);
  };

  paintClock(); setVerdict();
})();
