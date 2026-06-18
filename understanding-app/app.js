// Understanding app for: "Autopilot as a free-floating, dock-styled panel."
// Make the dashboard's Autopilot section look like an agent dock and be draggable
// anywhere (like the Ideas panel), still collapsible. Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).

(function () {
  // ── 1) top-nav view switcher ───────────────────────────────────
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

  // ── 2) the draggable Autopilot dock (mirrors the real drag system) ──
  var dock = document.getElementById('apdock');
  var grip = document.getElementById('apdockGrip');
  var canvas = document.getElementById('freeCanvas');
  var hint = document.getElementById('dragHint');
  var drag = null; // { startX, startY, baseX, baseY }

  function onDown(e) {
    var r = canvas.getBoundingClientRect();
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: dock.offsetLeft,
      baseY: dock.offsetTop,
      maxX: r.width - 40,
      maxY: r.height - 36,
    };
    dock.classList.add('apdock--lift');
    grip.setPointerCapture && grip.setPointerCapture(e.pointerId);
    if (hint) hint.classList.add('hint--done');
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    var x = drag.baseX + (e.clientX - drag.startX);
    var y = drag.baseY + (e.clientY - drag.startY);
    // clamp inside the canvas, leaving a grabbable strip (mirrors clampPos).
    x = Math.max(-dock.offsetWidth + 60, Math.min(drag.maxX, x));
    y = Math.max(0, Math.min(drag.maxY, y));
    dock.style.left = x + 'px';
    dock.style.top = y + 'px';
  }
  function onUp() {
    drag = null;
    dock.classList.remove('apdock--lift');
  }
  grip.addEventListener('pointerdown', onDown);
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onUp);

  // ── 3) collapse / expand (just the bar shows when collapsed) ────
  var chev = document.getElementById('apdockChev');
  var body = document.getElementById('apdockBody');
  chev.addEventListener('click', function () {
    var collapsed = dock.classList.toggle('apdock--collapsed');
    chev.textContent = collapsed ? '▸' : '▾';
    body.hidden = collapsed;
  });

  // ── 4) "what changes" list (kept in JS so the prose stays in one place) ──
  var CHANGES = [
    ['Move the panel into the canvas',
      'Render <code>&lt;AutopilotPanel/&gt;</code> inside <code>dash__body</code> as a third panel ' +
      '(<code>data-panel="autopilot"</code>), beside <code>ideas</code> and <code>agents</code> — ' +
      'no longer a band above the canvas.'],
    ['Add it to the drag layout',
      'Extend the free 2D layout to a third key: <code>positions.autopilot</code> saved in ' +
      '<code>claudeweb_dash_pos</code>; generalize <code>freePlaced</code>, <code>seededPositions</code> ' +
      '(the <code>[ideas, agents]</code> loop) and reset; add a <code>⠿</code> handle + lifted style.'],
    ['Dress it as a dock',
      'Reuse the agent-dock card chrome (rounded surface, header bar, body) with a distinct ' +
      '🛞 title/accent, so it reads as separate from the real agents.'],
    ['Keep it collapsible',
      'The existing toggle + per-device <code>claudeweb_dash_autopilot_collapsed</code> stays; ' +
      'collapsed = just the dock’s header bar (a minimized dock).'],
    ['Grid mode',
      'On narrow screens it snaps into the responsive flow like the other panels ' +
      '(default order: first — to confirm).'],
    ['Gating unchanged',
      'Still self-gates on the <code>autopilotTab</code> feature; renders nothing when off.'],
  ];
  var ol = document.getElementById('changes');
  CHANGES.forEach(function (c) {
    var li = document.createElement('li');
    li.innerHTML = '<b>' + c[0] + '</b> — ' + c[1];
    ol.appendChild(li);
  });

  // ── 5) confirm disclosures ──────────────────────────────────────
  var qs = document.getElementById('qs');
  qs.addEventListener('click', function (e) {
    var item = e.target.closest('.q__item');
    if (!item) return;
    var open = item.classList.toggle('q__item--open');
    if (open && !item.querySelector('.q__a').textContent) {
      item.querySelector('.q__a').textContent = item.dataset.a;
    }
  });
})();
