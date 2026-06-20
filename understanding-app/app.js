// Understanding app for: "Enlarge a dock to two horizontal spaces."
// A per-dock toggle (next to ★ important / 🔗 depends-on) that gives a dock
// grid-column: span 2 on the agent dashboard. Self-contained, no libs, relative
// URLs (served under /api/localview/<repo>/app/understanding/).

(function () {
  // ── 1) top-nav view switcher ───────────────────────────────────
  var nav = document.getElementById('nav');
  nav.addEventListener('click', function (e) {
    var btn = e.target.closest('.nav__btn');
    if (!btn) return;
    Array.prototype.forEach.call(nav.children, function (b) {
      b.classList.toggle('nav__btn--on', b === btn);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('view--on', v.id === 'view-' + btn.dataset.view);
    });
  });

  // ── 2) the interactive grid: click ⤢ to give a dock span-2 ──────
  // Mirrors the real dashboard — a √n-column grid of agent docks; "wide"
  // toggles grid-column: span 2 so the cell takes two horizontal spaces.
  var AGENTS = [
    { name: 'birocode', status: 'running', wide: false },
    { name: 'web-pilot', status: 'idle', wide: false },
    { name: 'docs-site', status: 'running', wide: false },
    { name: 'api-chatbot', status: 'idle', wide: false },
    { name: 'installer', status: 'done', wide: false },
    { name: 'homepage', status: 'idle', wide: false },
  ];
  var grid = document.getElementById('grid');
  var countEl = document.getElementById('wideCount');
  var hint = document.getElementById('demoHint');

  function render() {
    grid.innerHTML = '';
    AGENTS.forEach(function (a, i) {
      var li = document.createElement('li');
      li.className = 'mini mini--' + a.status + (a.wide ? ' mini--wide' : '');
      li.innerHTML =
        '<div class="mini__bar">' +
          '<span class="mini__dot"></span>' +
          '<span class="mini__name">' + a.name + '</span>' +
          '<span class="mini__ctl" title="important">★</span>' +
          '<span class="mini__ctl" title="depends on">🔗</span>' +
          '<button class="mini__ctl mini__wide' + (a.wide ? ' mini__wide--on' : '') +
            '" data-i="' + i + '" aria-pressed="' + a.wide + '" ' +
            'title="' + (a.wide ? 'shrink to one space' : 'enlarge to two spaces') + '">⤢</button>' +
        '</div>' +
        '<div class="mini__screen">' +
          (a.wide ? '<span class="mini__tag">spans 2 columns</span>' : '') +
          '<span class="mini__lines"></span>' +
        '</div>';
      grid.appendChild(li);
    });
    var n = AGENTS.filter(function (a) { return a.wide; }).length;
    countEl.textContent = n + ' wide';
    countEl.classList.toggle('mockbar__count--on', n > 0);
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.mini__wide');
    if (!btn) return;
    e.stopPropagation(); // same as the real toggle: don't "open" the agent
    var i = +btn.dataset.i;
    AGENTS[i].wide = !AGENTS[i].wide;
    if (hint) hint.classList.add('hint--done');
    render();
  });
  render();

  // ── 3) "the button" close-up: toggle its on/off state ──────────
  var hzWide = document.getElementById('hzWide');
  function toggleHz() {
    var on = hzWide.getAttribute('aria-pressed') !== 'true';
    hzWide.setAttribute('aria-pressed', on);
    hzWide.classList.toggle('hz__ctl--on', on);
    hzWide.title = on ? 'two spaces · on' : 'enlarge to two spaces (NEW)';
  }
  hzWide.addEventListener('click', toggleHz);
  hzWide.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHz(); }
  });

  // ── 4) the build chain (kept in JS so the prose lives in one place) ──
  var FLOW = [
    ['Toggle in the dock header',
      'A small <code>⤢</code> control (copy of <code>ImportantStar</code>) beside ★/🔗 in ' +
      '<code>PinnedAgent.jsx</code> and the cards in <code>Dashboard.jsx</code>; it ' +
      '<code>stopPropagation</code>s so it toggles instead of opening the agent.'],
    ['<code>toggleWide(id)</code> in Dashboard.jsx',
      'A copy of <code>toggleImportant</code>: optimistic + backend-synced via ' +
      '<code>updateTab(id, { wide: !tab.wide })</code>.'],
    ['Client passes it through',
      '<code>DockContext.toServerPatch</code> gets <code>if (\'wide\' in patch) body.wide = …</code> ' +
      'so the PATCH reaches the server (anything not whitelisted stays client-local).'],
    ['Backend stores it',
      'A new <code>bool Wide</code> on <code>DockTab</code> (default false), threaded like ' +
      '<code>Important</code>: <code>DockRegistry.Update</code> + <code>ToDto</code>, ' +
      '<code>DockController</code> <code>PatchRequest</code> / GET / Update.'],
    ['CSS does the widening',
      'A wide cell gets <code>grid-column: span 2</code> in <code>dashboard.css</code>; the ' +
      '<code>dash__group</code> wrapper spans too when a wide dock is a dependent’s primary.'],
  ];
  var ol = document.getElementById('flow');
  FLOW.forEach(function (c) {
    var li = document.createElement('li');
    li.innerHTML = '<b>' + c[0] + '</b> — ' + c[1];
    ol.appendChild(li);
  });

  // ── 5) confirm disclosures ─────────────────────────────────────
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
