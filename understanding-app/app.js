// Understanding app — the `local-app-zoom` OpenSpec change (proposal turn).
// 1) problem: browser zoom vs frame zoom toggle on a mock harness,
// 2) component: shared-ProductFrame diagram (static SVG in index.html),
// 3) mechanism: live demo of transform:scale(f) + calc(100%/f) in an overflow viewport,
// 4) compose: dock-wide CSS zoom × per-frame zoom with an effective-scale readout,
// 5) spec: the five requirements with unfoldable scenarios + a clamp widget.
(function () {
  'use strict';

  var ZOOM_MIN = 0.5, ZOOM_MAX = 2, ZOOM_STEP = 0.25;
  var pct = function (f) { return Math.round(f * 100) + '%'; };
  var $ = function (id) { return document.getElementById(id); };

  /* ================= tabs ================= */
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      document.querySelectorAll('.view').forEach(function (v) {
        v.classList.toggle('is-active', v.id === 'view-' + btn.dataset.view);
      });
    });
  });

  /* ================= 1 · problem: browser vs frame zoom ================= */
  var probCaptions = {
    browser: 'Browser zoom scales <b>everything</b> — chrome, composer and app together. The harness gets huge too.',
    frame: 'Frame zoom scales <b>only the embedded app</b>. Chrome, tabs and composer stay put. This is the feature.',
    none: 'Baseline — everything at natural size.'
  };
  document.querySelectorAll('.seg__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.seg__btn').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      var kind = btn.dataset.zoomkind;
      var harness = $('problem-harness'), app = $('problem-app');
      if (kind === 'browser') {
        harness.style.transform = 'scale(1.5)';
        harness.style.width = 'calc(100% / 1.5)'; harness.style.height = 'calc(100% / 1.5)';
        app.style.transform = ''; app.style.width = ''; app.style.height = '';
      } else if (kind === 'frame') {
        harness.style.transform = ''; harness.style.width = ''; harness.style.height = '';
        app.style.transform = 'scale(1.5)';
        app.style.width = 'calc(100% / 1.5)'; app.style.height = 'calc(100% / 1.5)';
      } else {
        harness.style.transform = ''; harness.style.width = ''; harness.style.height = '';
        app.style.transform = ''; app.style.width = ''; app.style.height = '';
      }
      $('problem-caption').innerHTML = probCaptions[kind];
    });
  });
  $('problem-frame').style.overflow = 'hidden';

  /* ================= shared zoom-state factory ================= */
  // Mirrors the planned ProductFrame implementation: clamp, step, apply
  // transform + compensated size to the "app" inside an overflow:auto viewport.
  function makeZoom(appEl, levelEl, outBtn, inBtn, onChange) {
    var f = 1;
    function apply() {
      if (f === 1) {
        appEl.style.transform = ''; appEl.style.width = ''; appEl.style.height = '';
      } else {
        appEl.style.transform = 'scale(' + f + ')';
        appEl.style.width = 'calc(100% / ' + f + ')';
        appEl.style.height = 'calc(100% / ' + f + ')';
      }
      levelEl.textContent = pct(f);
      levelEl.classList.toggle('is-hot', f !== 1);
      outBtn.disabled = f <= ZOOM_MIN;
      inBtn.disabled = f >= ZOOM_MAX;
      if (onChange) onChange(f);
    }
    outBtn.addEventListener('click', function () { f = Math.max(ZOOM_MIN, +(f - ZOOM_STEP).toFixed(2)); apply(); });
    inBtn.addEventListener('click', function () { f = Math.min(ZOOM_MAX, +(f + ZOOM_STEP).toFixed(2)); apply(); });
    apply();
    return { set: function (v) { f = v; apply(); }, get: function () { return f; } };
  }

  /* ================= 3 · mechanism demo ================= */
  var mechZoom = makeZoom($('mech-app'), $('mech-level'), $('mech-out'), $('mech-in'), function (f) {
    var code =
      '/* .product-frame__viewport */\n' +
      'overflow: hidden;            /* clips sub-pixel rounding;\n' +
      '                                scaled box = exactly 100% */\n\n' +
      '/* iframe.product-frame */\n' +
      'transform: <b>scale(' + f + ')</b>;\n' +
      'transform-origin: top left;\n' +
      'width:  <b>calc(100% / ' + f + ')</b>;  /* = ' + pct(1 / f) + ' */\n' +
      'height: <b>calc(100% / ' + f + ')</b>;';
    $('mech-code').innerHTML = code;
    var cap;
    if (f === 1) cap = 'Natural size — no transform applied at all (the 100% case is a true no-op).';
    else if (f < 1) cap = 'Zoomed out to ' + pct(f) + ': the compensated size (' + pct(1 / f) + ' laid out, then scaled down) makes the app fill the viewport exactly — more app, no dead margins.';
    else cap = 'Zoomed in to ' + pct(f) + ': in the real iframe the app sees a ' + pct(1 / f) + ' inner viewport painted magnified, and overflow scrolls with the app’s own scrollbars. (This div mock has no inner viewport — scroll the dashed box instead.) The frame’s footprint in the harness hasn’t moved.';
    $('mech-caption').innerHTML = cap;
  });
  $('mech-reset').addEventListener('click', function () { mechZoom.set(1); });

  /* ================= 4 · compose demo ================= */
  var dockZoom = 1;
  function updateMath(frameF) {
    $('math-dock').textContent = pct(dockZoom);
    $('math-frame').textContent = pct(frameF);
    $('math-eff').textContent = pct(dockZoom * frameF);
  }
  var compZoom = makeZoom($('comp-app'), $('comp-level'), $('comp-out'), $('comp-in'), function (f) {
    updateMath(f);
  });
  $('dock-zoom').addEventListener('input', function () {
    dockZoom = parseFloat(this.value);
    $('dock-zoom-val').textContent = pct(dockZoom);
    // The real dock uses CSS `zoom` on .phone__screen; `zoom` has broad support
    // in current engines, and this demo mirrors the real mechanism on purpose.
    $('comp-screen').style.zoom = dockZoom === 1 ? '' : String(dockZoom);
    updateMath(compZoom.get());
  });

  /* ================= 5 · spec requirement cards ================= */
  var REQS = [
    {
      name: 'Embedded local apps have a zoom control',
      text: 'Both proxy-embedding surfaces — the dock’s local-apps view and the Local tab — get zoom-in / zoom-out / reset, with the level shown whenever it isn’t 100%. Rendered only while an app frame is showing.',
      scenarios: [
        ['Zooming in the dock’s local-app view', 'operator presses zoom-in on an open local app', 'the app renders larger inside the dock’s frame; the control shows the new level'],
        ['Zooming out on the Local tab', 'a user presses zoom-out', 'the app renders smaller, showing more of it at once'],
        ['Reset to 100%', 'level ≠ 100% and reset is pressed', 'natural size returns and the indicator disappears']
      ]
    },
    {
      name: 'Zoom scales only the embedded app',
      text: 'Only the app content inside the frame scales. Dock chrome, chat, composer, tab navigation — all stay at normal size. Zoomed-in overflow is scrollable; the frame’s footprint in the harness layout never changes.',
      scenarios: [
        ['Harness chrome is unaffected', 'the user changes the zoom on either surface', 'only the app content changes size; the harness UI doesn’t scale, move or reflow'],
        ['Zoomed-in content is reachable', 'the zoom makes content larger than the frame', 'it can be scrolled within the frame — every part stays reachable']
      ]
    },
    {
      name: 'Zoom range is bounded in fixed steps',
      text: '25-percentage-point steps, clamped to 50%–200%. Zoom-in at max / zoom-out at min are no-ops (buttons disabled or inert). Try it:',
      clamp: true,
      scenarios: [
        ['Clamped at the maximum', 'level is 200% and zoom-in is pressed', 'the level stays 200%'],
        ['Clamped at the minimum', 'level is 50% and zoom-out is pressed', 'the level stays 50%']
      ]
    },
    {
      name: 'Zoom is per-surface and ephemeral',
      text: 'Each dock’s frame and the Local tab zoom independently. The level is client-side UI state: never persisted, reset to 100% on reload (like maximize-chat). The dashboard’s whole-dock content-zoom slider keeps its behavior and stays independent.',
      scenarios: [
        ['Docks zoom independently', 'one dock’s app is zoomed while another dock also shows an app', 'only the first dock’s app changes size'],
        ['Reset on reload', 'a zoomed surface and the web UI is reloaded', 'that surface renders at 100% again'],
        ['Independent of the dashboard content-zoom slider', 'both zooms are set', 'both apply (frame composes on top of dock) and changing one never changes the other’s setting']
      ]
    },
    {
      name: 'Zoom follows each surface’s existing mode gate',
      text: 'Local tab: a viewing control, available in Basic AND Advanced (the phone / End-User surface was the explicitly requested target — the CLAUDE.md “new UI defaults to Advanced” exception, taken deliberately). Dock: appears only where docks appear, behind the existing Advanced gate. App tab & Landing stay zoom-less.',
      scenarios: [
        ['Basic user can zoom on the Local tab', 'a Basic-mode user views a local app there', 'the zoom control is available and works'],
        ['Basic mode shows no dock zoom', 'the UI is in Basic (Simple) mode', 'no agent dock is shown, hence no dock zoom control'],
        ['App tab preview unchanged', 'a user views the App tab preview or Landing', 'no zoom control; the embed behaves exactly as before']
      ]
    }
  ];

  var reqsEl = $('reqs');
  REQS.forEach(function (r, i) {
    var d = document.createElement('details');
    d.className = 'req';
    if (i === 0) d.open = true;
    var scen = r.scenarios.map(function (s) {
      return '<div class="scenario"><b>' + s[0] + '</b>' +
        '<span class="wt">WHEN</span>' + s[1] + '<br>' +
        '<span class="wt">THEN</span>' + s[2] + '</div>';
    }).join('');
    d.innerHTML =
      '<summary><span class="req__num">R' + (i + 1) + '</span>' + r.name + '</summary>' +
      '<div class="req__body"><p>' + r.text + '</p>' +
      (r.clamp ? '<div class="clampdemo"><div class="track" id="clamp-track"></div>' +
        '<div class="zoomctl zoomctl--inline"><button id="clamp-out" aria-label="zoom out">−</button>' +
        '<span class="zoomctl__level" id="clamp-level">100%</span>' +
        '<button id="clamp-in" aria-label="zoom in">+</button></div></div>' +
        '<div class="clampmsg" id="clamp-msg"></div>' : '') +
      scen + '</div>';
    reqsEl.appendChild(d);
  });

  /* clamp widget inside R3 */
  var LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  var track = $('clamp-track');
  LEVELS.forEach(function (l) {
    var t = document.createElement('span');
    t.className = 'tick' + (l === ZOOM_MIN || l === ZOOM_MAX ? ' is-edge' : '');
    t.dataset.level = String(l);
    t.textContent = Math.round(l * 100);
    track.appendChild(t);
  });
  var clampF = 1;
  function drawClamp(msg) {
    track.querySelectorAll('.tick').forEach(function (t) {
      t.classList.toggle('is-cur', parseFloat(t.dataset.level) === clampF);
    });
    $('clamp-level').textContent = pct(clampF);
    $('clamp-out').disabled = clampF <= ZOOM_MIN;
    $('clamp-in').disabled = clampF >= ZOOM_MAX;
    $('clamp-msg').textContent = msg || '';
  }
  $('clamp-out').addEventListener('click', function () {
    if (clampF <= ZOOM_MIN) { drawClamp('clamped — no-op at 50%'); return; }
    clampF = +(clampF - ZOOM_STEP).toFixed(2); drawClamp();
  });
  $('clamp-in').addEventListener('click', function () {
    if (clampF >= ZOOM_MAX) { drawClamp('clamped — no-op at 200%'); return; }
    clampF = +(clampF + ZOOM_STEP).toFixed(2); drawClamp();
  });
  drawClamp();
})();
