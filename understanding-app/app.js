// Understanding app for: "Autopilot loop mode — re-send one fixed prompt until
// the agent is genuinely done." Self-contained, no libs, relative URLs
// (served under /api/localview/<repo>/app/understanding/).

(function () {
  // ── view switcher ───────────────────────────────────────────────
  var nav = document.getElementById('nav');
  nav.addEventListener('click', function (e) {
    var btn = e.target.closest('.nav__btn');
    if (!btn) return;
    var view = btn.dataset.view;
    Array.prototype.forEach.call(nav.children, function (b) {
      b.classList.toggle('nav__btn--on', b === btn);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('view--on', v.id === 'view-' + view);
    });
  });

  // ── HOW: the per-turn decision (kept here so prose lives in one place) ──
  var FLOW = [
    ['stop', 'STOP · done', 'Last message contains the <b>sentinel</b> (e.g. <code>LOOP_DONE</code>) → stop, mark <b>done</b>. The job is finished.'],
    ['esc', 'STOP · escalate', 'Last message mentions a <b>risky action</b> (the existing deny-list: deploy / push / <code>reset --hard</code> …) → stop and hand back to you. Never auto-resend into danger.'],
    ['cap', 'STOP · capped', 'The <b>iteration cap</b> is reached → stop, mark <b>capped</b>. The runaway backstop.'],
    ['err', 'PAUSE · error', 'The run ended in <code>error</code> → pause, mark <b>error</b>, wait for you.'],
    ['go',  'RESEND', 'Otherwise → <b>resend the one fixed prompt</b>, bump the counter, write an audit entry. The loop continues.'],
  ];
  var flow = document.getElementById('flow');
  FLOW.forEach(function (f) {
    var li = document.createElement('li');
    li.dataset.k = f[0];
    li.innerHTML = '<span class="res">' + f[1] + '</span>' + f[2];
    flow.appendChild(li);
  });

  // ── SAFETY ──────────────────────────────────────────────────────
  var SAFETY = [
    ['🔒', false, '<b>Operator gate, off by default.</b> The web can start/stop a loop only when the <b>host</b> has opened the gate — and the web can never open it. Same fence as every other autopilot endpoint.'],
    ['🧱', true,  '<b>Sentinel + cap, not an LLM judge.</b> Done-detection is deliberately deterministic and free — and adds <b>no new prompt-injection surface</b>. An LLM judge reading untrusted agent output would.'],
    ['🛑', false, '<b>Hard <code>maxIterations</code> cap</b> (default 10). The loop refuses to run past it, no matter what.'],
    ['🚧', false, '<b>Deny-list escalation.</b> A risky-looking ending pauses the loop and hands control back to you instead of resending.'],
    ['✋', false, '<b>Per-loop Stop button</b>, and auto-pause on any run <code>error</code> — not just clean completions.'],
    ['📒', false, '<b>Every send is audited</b> to the append-only <code>autopilot-audit.jsonl</code> (<code>outcome = "loop"</code>), so unattended sends are durably recorded.'],
  ];
  var safety = document.getElementById('safety');
  SAFETY.forEach(function (s) {
    var li = document.createElement('li');
    if (s[1]) li.className = 'star';
    li.innerHTML = '<span class="ic">' + s[0] + '</span><span>' + s[2] + '</span>';
    safety.appendChild(li);
  });

  // ── PLAN: slices ────────────────────────────────────────────────
  var SLICES = [
    ['Backend engine + config', 'The <code>LoopConfig</code> model + persistence; drive the per-turn decision from the autopilot tick. Reuse <code>RunSession.TryBeginRun</code> + <code>CliRunnerService.RunAsync</code> for the send, and the audit log. All gated.'],
    ['API', '<code>POST /api/autopilot/loop</code> (start / update / stop); loop state folded into <code>GET /api/autopilot</code>.'],
    ['Frontend', 'Per-agent loop controls in <code>AutopilotConsole</code> (prompt + cap + sentinel; live iteration count, state badge, <b>Stop</b>). Live via the existing 4&thinsp;s poll. Advanced-gated.'],
    ['Verify', 'On an isolated port with Playwright: resend-on-done, sentinel-stop, cap-stop, deny-list escalate, Stop button. Plus an honesty pass on this app.'],
  ];
  var slices = document.getElementById('slices');
  SLICES.forEach(function (s) {
    var li = document.createElement('li');
    li.innerHTML = '<b>' + s[0] + '</b> — ' + s[1];
    slices.appendChild(li);
  });

  // ── PLAN: schema ────────────────────────────────────────────────
  var SCHEMA = [
    ['repoId', 'string', 'which agent'],
    ['prompt', 'string', 'the fixed text to resend (seedable from a routine / custom prompt)'],
    ['sentinel', 'string', 'stop phrase to watch for (default "LOOP_DONE")'],
    ['maxIterations', 'int', 'hard cap (default 10)'],
    ['active', 'bool', 'loop running?'],
    ['iterationsDone', 'int', 'live counter'],
    ['status', 'string', 'looping | done | escalate | capped | error | stopped'],
    ['lastSentAt', 'long', 'timestamp of the last resend'],
  ];
  var schema = document.getElementById('schema');
  schema.innerHTML = '<div class="schema__row schema__head"><span class="f">field</span><span class="t">type</span><span class="d">meaning</span></div>';
  SCHEMA.forEach(function (r) {
    var div = document.createElement('div');
    div.className = 'schema__row';
    div.innerHTML = '<span class="f">' + r[0] + '</span><span class="t">' + r[1] + '</span><span class="d">' + r[2] + '</span>';
    schema.appendChild(div);
  });

  // ── PLAN: open questions ────────────────────────────────────────
  var OPENS = [
    ['default', '<b>Done-detection = sentinel + cap</b> (vs LLM judge / no-progress / manual). Picked the deterministic, injection-free default.'],
    ['default', '<b>Resend trigger = after <i>every</i> completed turn</b> (not only question-endings) — that’s what pushes through the “slice A or B?” prompts.'],
    ['default', '<b>One loop per agent</b> at a time.'],
  ];
  var opens = document.getElementById('opens');
  OPENS.forEach(function (o) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="tagd">default</span><span>' + o[1] + '</span>';
    opens.appendChild(li);
  });

  // ── UX: the interactive loop simulator ──────────────────────────
  var S = { armed: false, iter: 0, cap: 5, sentinel: 'LOOP_DONE', prompt: '', ending: 'work', done: false };

  var el = {
    form: document.getElementById('simForm'),
    live: document.getElementById('simLive'),
    badge: document.getElementById('simBadge'),
    fPrompt: document.getElementById('fPrompt'),
    fSentinel: document.getElementById('fSentinel'),
    fCap: document.getElementById('fCap'),
    btnArm: document.getElementById('btnArm'),
    btnStop: document.getElementById('btnStop'),
    btnReset: document.getElementById('btnReset'),
    btnTurn: document.getElementById('btnTurn'),
    feed: document.getElementById('feed'),
    liveStatus: document.getElementById('liveStatus'),
    liveIter: document.getElementById('liveIter'),
    liveCap: document.getElementById('liveCap'),
    liveSent: document.getElementById('liveSent'),
    liveMeter: document.getElementById('liveMeter'),
    chips: Array.prototype.slice.call(document.querySelectorAll('.chip')),
  };

  function addMsg(cls, tag, html) {
    var d = document.createElement('div');
    d.className = 'msg msg--' + cls;
    d.innerHTML = (tag ? '<span class="msg__tag">' + tag + '</span>' : '') + html;
    el.feed.appendChild(d);
    el.feed.scrollTop = el.feed.scrollHeight;
  }
  function setStatus(s) {
    el.liveStatus.textContent = s;
    el.liveStatus.dataset.s = s;
    el.badge.textContent = s;
  }
  function setChipsEnabled(on) {
    el.chips.forEach(function (c) { c.disabled = !on; });
    el.btnTurn.disabled = !on;
  }
  function refreshMeter() {
    el.liveIter.textContent = S.iter;
    el.liveCap.textContent = S.cap;
    el.liveMeter.style.width = Math.min(100, (S.iter / S.cap) * 100) + '%';
  }

  // arm
  el.btnArm.addEventListener('click', function () {
    S.armed = true; S.iter = 0; S.done = false;
    S.prompt = el.fPrompt.value.trim() || 'Keep going.';
    S.sentinel = (el.fSentinel.value.trim() || 'LOOP_DONE');
    S.cap = Math.max(1, parseInt(el.fCap.value, 10) || 5);
    el.form.hidden = true; el.live.hidden = false;
    setStatus('looping'); refreshMeter();
    el.liveSent.textContent = 'just now';
    el.feed.innerHTML = '';
    addMsg('sys', 'gate', 'Operator gate open · loop armed for <b>birocode</b>.');
    addMsg('sys', 'send #1', S.prompt);
    el.liveSent.textContent = 'sent #1';
    setChipsEnabled(true);
  });

  // pick how the next turn ends
  el.chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      S.ending = chip.dataset.end;
      el.chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
    });
  });

  // run one turn-completion through the decision
  el.btnTurn.addEventListener('click', function () {
    if (!S.armed || S.done) return;

    // 1) the agent emits its turn-ending message
    if (S.ending === 'sentinel') {
      addMsg('ai', 'agent', 'All slices shipped. <b>' + S.sentinel + '</b>');
    } else if (S.ending === 'deny') {
      addMsg('ai', 'agent', 'Looks good — I’ll <b>deploy to prod and force-push</b> now.');
    } else if (S.ending === 'error') {
      addMsg('ai', 'agent', 'Run crashed: <b>build failed</b> (non-zero exit).');
    } else {
      addMsg('ai', 'agent', 'Did the next slice. Should I do slice ' + (S.iter + 1) + ' or refactor first?');
    }

    // 2) the engine decides (mirrors the per-turn flow)
    if (S.ending === 'sentinel') {
      finish('done', 'stop', 'Sentinel “' + S.sentinel + '” seen → loop <b>done</b>. No resend.');
    } else if (S.ending === 'deny') {
      finish('escalate', 'esc', 'Deny-list hit (deploy / force-push) → <b>escalated to you</b>. No resend.');
    } else if (S.ending === 'error') {
      finish('error', 'err', 'Run <code>error</code> → loop <b>paused</b>, waiting for you.');
    } else {
      // more work → resend, unless that send would exceed the cap
      S.iter += 1;
      refreshMeter();
      if (S.iter >= S.cap) {
        setStatus('capped');
        addMsg('esc', 'engine', 'Iteration cap (' + S.cap + ') reached → loop <b>capped</b>. No further resend.');
        endLoop();
      } else {
        addMsg('sys', 'send #' + (S.iter + 1), 'Resend → ' + S.prompt);
        el.liveSent.textContent = 'sent #' + (S.iter + 1);
      }
    }
  });

  function finish(status, cls, msg) {
    setStatus(status);
    addMsg(cls === 'stop' ? 'stop' : cls, 'engine', msg);
    endLoop();
  }
  function endLoop() {
    S.done = true;
    setChipsEnabled(false);
  }

  // stop button
  el.btnStop.addEventListener('click', function () {
    if (S.done) return;
    setStatus('stopped');
    addMsg('esc', 'you', 'Stopped the loop manually.');
    endLoop();
  });

  // reset demo
  el.btnReset.addEventListener('click', function () {
    S.armed = false; S.done = false; S.iter = 0;
    el.form.hidden = false; el.live.hidden = true;
    el.feed.innerHTML = '';
    el.badge.textContent = 'idle';
    setChipsEnabled(false);
    el.chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
  });

  // default the "more work" chip as pressed
  (el.chips[0] || {}).setAttribute && el.chips[0].setAttribute('aria-pressed', 'true');
})();
