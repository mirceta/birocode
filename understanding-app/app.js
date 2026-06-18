// Understanding app for: "Autopilot goes to the harness" — CORRECTED after the
// user pointed out the dashboard is duplicated (harness tab + local app). The
// feature is de-duplication, not a move. Self-contained, no libraries, relative URLs.

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

  // ── 2) shared vs gap ────────────────────────────────────────────
  var PANES = {
    same: {
      h3: 'Present in BOTH dashboards',
      badge: 'duplicated', badgeCls: 'badge--stay', rowCls: 'row--stay', ico: '＝',
      rows: [
        ['Agents', 'per-repo state + arm/disarm, auto-advance, threshold, kill'],
        ['Routine prompts', "the brain's editable label space (add/edit/adopt)"],
        ['Suggestion history', 'the engine verdict log'],
        ['Auto-sent', 'append-only audit trail of real sends'],
      ],
    },
    gap: {
      h3: 'De-duplicated — the local app is retired',
      badge: 'done', badgeCls: 'badge--stay', rowCls: 'row--stay', ico: '✓',
      rows: [
        ['Intercepted feed ported', 'now the 5th subtab in Autopilot.jsx (Part 1) — InterceptEvent was already on /api/autopilot'],
        ['Gate-off state folded in', 'on a 403 the tab now explains "the operator must turn it on at the host", like the local app did'],
        ['autopilot-app/ deleted', 'folder + AutopilotApp.cs + DI + localview registration removed — one dashboard, no drift'],
      ],
    },
  };
  var diffTabs = document.getElementById('diffTabs');
  var diffScreen = document.getElementById('diffScreen');
  function renderDiff(id) {
    var d = PANES[id];
    diffScreen.innerHTML =
      '<div class="pane"><h3>' + d.h3 +
      '<span class="badge ' + d.badgeCls + '">' + d.badge + '</span></h3><div class="rows">' +
      d.rows.map(function (r) {
        return '<div class="row ' + d.rowCls + '"><span class="row__ico">' + d.ico +
          '</span><span class="row__t"><b>' + r[0] + '</b><span>' + r[1] + '</span></span></div>';
      }).join('') + '</div></div>';
  }
  diffTabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    Array.prototype.forEach.call(diffTabs.children, function (b) {
      b.classList.toggle('tab--on', b === btn);
    });
    renderDiff(btn.dataset.tab);
  });
  renderDiff('same');

  // ── 3) open-question disclosures ────────────────────────────────
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
