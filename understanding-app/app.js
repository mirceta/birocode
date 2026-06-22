// Tab router + the "drive a turn" simulator. Plain vanilla JS, no build step.
// The interactive graphs live in mapcore.js (renderGraph) + data.js (specs).
(function () {
  'use strict';

  // ---------- tab router ----------
  var tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tabbtn'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.tabpanel'));
  var ids = tabBtns.map(function (b) { return b.dataset.tab; });

  function showTab(id) {
    if (ids.indexOf(id) === -1) id = ids[0];
    tabBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
    panels.forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + id); });
    // graph tabs go full-bleed so the canvas uses the whole width
    document.body.classList.toggle('graphtab', id === 'map' || id === 'life' || id === 'sse');
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    // Cytoscape needs a visible (non-zero) container, so render on show.
    if (id === 'map')  window.renderGraph && window.renderGraph('cy-map', SYSTEM_MAP, { detailId: 'map-detail', intro: 'The whole journey of one chat turn. Every <b>box is a place it runs</b>: the solid boxes are the four tiers (your device · backend :5099 · CLI · disk); the dashed boxes inside the backend are its components. <b>Hover</b> a node to light up its connections, or <b>click a box header</b> to read what that tier/component is. The autopilot lives <i>inside</i> the backend — just another caller of the same machinery.' });
    if (id === 'life') window.renderGraph && window.renderGraph('cy-life', TURN_FLOW, { detailId: 'life-detail', intro: 'The five stages of a turn, the reject branch, and the loop-back. Hover a stage to isolate it; click for detail.' });
    if (id === 'sse')  window.renderGraph && window.renderGraph('cy-sse', SSE_FAN, { detailId: 'sse-detail', intro: 'Raw stream-json reduced to seven stable event shapes. The three boxes are where each thing lives — note the raw CLI output never leaves its box; only the seven reduced shapes reach the client box. Hover the reducer or any event to trace it.' });
    window.scrollTo({ top: 0 });
  }
  tabBtns.forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  window.addEventListener('hashchange', function () { showTab((location.hash || '').slice(1)); });

  // keep graphs filling their containers on resize
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { window.resizeGraphs && window.resizeGraphs(); }, 150); });

  // ---------- "drive a turn" simulator ----------
  (function simulator() {
    var gateOn = false, busy = false, owner = null, seq = 0, timer = null;
    var slot = document.getElementById('slot');
    var slotwho = document.getElementById('slotwho');
    var logEl = document.getElementById('log');
    var finishBtn = document.getElementById('finish');
    var gateEl = document.getElementById('gate');
    var gatelbl = document.getElementById('gatelbl');
    if (!slot) return;
    var META = {
      you: { name: 'You (phone)', color: 'var(--accent)', kind: 'human' },
      cls: { name: 'Classifier (auto-advance)', color: 'var(--accent2)', kind: 'auto' },
      lp:  { name: 'Loop mode (resend)', color: 'var(--loop)', kind: 'auto' },
    };
    function log(cls, msg) {
      var d = document.createElement('div');
      d.className = 'ln ' + cls; d.textContent = msg;
      logEl.insertBefore(d, logEl.firstChild);
    }
    function setWin(driver) {
      ['you', 'cls', 'lp'].forEach(function (k) { document.getElementById('d-' + k).classList.toggle('win', k === driver); });
    }
    function begin(driver) {
      var m = META[driver];
      if (m.kind === 'auto' && !gateOn) { log('sys', '· ' + m.name + ': gate is OFF — autopilot does nothing. (Only you can send.)'); return; }
      if (busy) {
        if (driver === 'you') log('rej', '✗ POST /api/chat → 409 Conflict — a turn is already running (' + META[owner].name + ').');
        else if (driver === 'lp' && owner === 'cls') log('rej', '✗ loop skips: classifier holds the slot (and loop would take precedence next idle tick).');
        else if (driver === 'cls' && owner === 'lp') log('rej', '✗ classifier skips: active loop on this repo → classification is bypassed entirely.');
        else log('rej', '✗ ' + m.name + ' skips: IsBusy / TryBeginRun==false — won’t pile on ' + META[owner].name + '.');
        return;
      }
      busy = true; owner = driver; seq += 1;
      slot.classList.remove('idle'); slot.classList.add('busy');
      slot.style.color = m.color; slotwho.style.color = m.color;
      slotwho.textContent = 'running · ' + m.name;
      setWin(driver); finishBtn.disabled = false;
      log('ok', '✓ TryBeginRun("builder") → claimed by ' + m.name + '.  seq continues at ' + seq + '.');
      if (driver === 'you') log('sys', '  POST /api/chat → spawns claude on a detached Task.Run (Cts token).');
      if (driver === 'cls') log('sys', '  Tick: confident + non-risky + gated → TrySend → resume session.');
      if (driver === 'lp')  log('sys', '  Tick: no sentinel / under cap → TrySendLoop → resend fixed prompt (audited).');
      var n = 0;
      timer = setInterval(function () {
        n++;
        if (n === 1) log('ev', '  → SSE: {type:"token", …}  (buffered seq, broadcast to subscribers)');
        if (n === 2) log('ev', '  → SSE: {type:"tool", status:"start", …}');
        if (n >= 3) { clearInterval(timer); timer = null; }
      }, 700);
    }
    function finish() {
      if (!busy) return;
      if (timer) { clearInterval(timer); timer = null; }
      log('ok', '✓ {type:"done"} → RunSession.Complete(): status=done, slot freed, transcript on disk.');
      if (owner !== 'you') log('sys', '  next tick reads this reply from the JSONL transcript to decide what’s next.');
      busy = false; owner = null;
      slot.classList.add('idle'); slot.classList.remove('busy');
      slot.style.color = ''; slotwho.style.color = '';
      slotwho.textContent = 'idle — open for one writer';
      setWin(null); finishBtn.disabled = true;
    }
    function reset() {
      if (timer) { clearInterval(timer); timer = null; }
      busy = false; owner = null; seq = 0;
      slot.classList.add('idle'); slot.classList.remove('busy');
      slot.style.color = ''; slotwho.style.color = '';
      slotwho.textContent = 'idle — open for one writer';
      setWin(null); finishBtn.disabled = true; logEl.innerHTML = '';
      log('sys', '· reset. seq back to 0. Tip: open the gate, start the classifier, then hit "Send a turn" to see a 409.');
    }
    document.querySelectorAll('.driver button[data-driver]').forEach(function (b) {
      b.addEventListener('click', function () { begin(b.getAttribute('data-driver')); });
    });
    finishBtn.addEventListener('click', finish);
    document.getElementById('reset').addEventListener('click', reset);
    gateEl.addEventListener('click', function () {
      gateOn = !gateOn;
      gateEl.classList.toggle('on', gateOn);
      gatelbl.textContent = gateOn ? 'on' : 'off';
      log('sys', '· operator gate ' + (gateOn ? 'OPENED — autopilot drivers may now act.' : 'closed — autopilot drivers are inert.'));
    });
    reset();
  })();

  // ---------- boot ----------
  showTab((location.hash || '#overview').slice(1));
})();
