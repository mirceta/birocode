/* local-app-state-preserve — interactive explainer.
   Vanilla JS, no dependencies, relative URLs only. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ============ top tabs ============ */
  $$('#tabs .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('#tabs .tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
      $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + btn.dataset.view); });
    });
  });

  /* ============ shared 1s ticker ============ */
  var tickers = [];
  setInterval(function () {
    tickers = tickers.filter(function (fn) { return fn() !== false; });
  }, 1000);

  function flash(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function makeLogger(el) {
    return function (tag, msg) {
      var line = document.createElement('div');
      line.className = 'log-line';
      var t = document.createElement('span');
      t.className = 'log-tag ' + tag;
      t.textContent = tag === 'bad' ? 'RELOAD' : tag === 'ok' ? 'KEPT' : 'INFO';
      line.appendChild(t);
      line.appendChild(document.createTextNode(msg));
      var muted = el.querySelector('.log-line.muted');
      if (muted) muted.remove();
      el.insertBefore(line, el.firstChild);
      while (el.children.length > 30) el.lastChild.remove();
    };
  }

  /* ================================================================
     VIEW 1 — the bug, live: mock harness in two modes
     ================================================================ */
  (function () {
    var APPS = {
      a: { title: '🔢 Counter pad', alt: false },
      b: { title: '📝 Scratch notes', alt: true }
    };
    var mode = 'today';           // 'today' | 'keepalive'
    var studioTab = 'local';
    var activeApp = 'a';
    var frames = {};              // appId -> wrapper element

    var area = $('#mock-frame-area');
    var log = makeLogger($('#bug-log'));

    function applyZoom(wrap) {
      var z = wrap._zoom;
      var content = wrap.querySelector('.fapp');
      content.style.transform = 'scale(' + (z / 100) + ')';
      content.style.width = (10000 / z) + '%';
      wrap.querySelector('.zreset').textContent = z + '%';
    }

    function makeFrame(appId) {
      var spec = APPS[appId];
      var wrap = document.createElement('div');
      wrap.className = 'fwrap';
      wrap._zoom = 100;
      wrap._born = Date.now();

      var vp = document.createElement('div');
      vp.className = 'fviewport';
      var app = document.createElement('div');
      app.className = 'fapp' + (spec.alt ? ' alt' : '');

      var head = document.createElement('div');
      head.className = 'fapp-head';
      var title = document.createElement('div');
      title.className = 'fapp-title';
      title.textContent = spec.title;
      var age = document.createElement('span');
      age.className = 'fapp-age';
      head.appendChild(title);
      head.appendChild(age);
      app.appendChild(head);

      if (appId === 'a') {
        var row = document.createElement('div');
        row.className = 'fapp-row';
        row.innerHTML = '<label>counter</label><button class="bump">＋1</button><span class="cnt">0</span>';
        row.querySelector('.bump').addEventListener('click', function () {
          var c = row.querySelector('.cnt');
          c.textContent = (parseInt(c.textContent, 10) + 1);
        });
        app.appendChild(row);
        var row2 = document.createElement('div');
        row2.className = 'fapp-row';
        row2.innerHTML = '<label>a form</label><input type="text" placeholder="type something, then navigate away…">';
        app.appendChild(row2);
      } else {
        var row3 = document.createElement('div');
        row3.className = 'fapp-row';
        row3.innerHTML = '<textarea placeholder="draft a note here, then flip back to Counter pad…"></textarea>';
        app.appendChild(row3);
      }

      vp.appendChild(app);
      wrap.appendChild(vp);

      var pill = document.createElement('div');
      pill.className = 'fpill';
      pill.innerHTML = '<button class="zminus" title="zoom out">−</button>' +
        '<button class="zreset" title="reset zoom">100%</button>' +
        '<button class="zplus" title="zoom in">＋</button>' +
        (mode === 'keepalive' ? '<button class="frefresh" title="reload just this app (new!)">↻</button>' : '');
      pill.querySelector('.zminus').addEventListener('click', function () {
        wrap._zoom = Math.max(50, wrap._zoom - 10); applyZoom(wrap);
      });
      pill.querySelector('.zplus').addEventListener('click', function () {
        wrap._zoom = Math.min(200, wrap._zoom + 10); applyZoom(wrap);
      });
      pill.querySelector('.zreset').addEventListener('click', function () {
        wrap._zoom = 100; applyZoom(wrap);
      });
      var rf = pill.querySelector('.frefresh');
      if (rf) rf.addEventListener('click', function () { refreshFrame(appId); });
      wrap.appendChild(pill);

      tickers.push(function () {
        if (!wrap.isConnected) return false;
        age.textContent = 'document age: ' + Math.round((Date.now() - wrap._born) / 1000) + 's';
      });
      age.textContent = 'document age: 0s';

      frames[appId] = wrap;
      area.appendChild(wrap);
      flash(wrap);
      return wrap;
    }

    function destroyFrame(appId) {
      if (frames[appId]) { frames[appId].remove(); delete frames[appId]; }
    }
    function destroyAll() { Object.keys(frames).forEach(destroyFrame); }

    function showOnly(appId) {
      Object.keys(frames).forEach(function (k) {
        frames[k].classList.toggle('hidden-frame', k !== appId);
      });
    }

    function refreshFrame(appId) {
      // reloadKey bump: fresh document, but zoom survives — it lives in the host, not the document
      var keptZoom = frames[appId] ? frames[appId]._zoom : 100;
      destroyFrame(appId);
      var w = makeFrame(appId);
      w._zoom = keptZoom; applyZoom(w);
      showOnly(appId);
      log('info', '↻ refreshFrame(local:birocode:' + appId + ') → reloadKey bumped → intentional fresh document. Zoom kept — it lives in the host, not the document.');
    }

    /* studio tabs */
    $$('#mock-tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.dataset.mtab;
        if (tab === studioTab) return;
        var leavingLocal = studioTab === 'local';
        studioTab = tab;
        $$('#mock-tabs button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        $('#mock-local').hidden = tab !== 'local';
        $('#mock-other').hidden = tab === 'local';

        if (tab !== 'local') {
          $('#mock-other-inner').textContent = tab === 'console'
            ? '📟 Console view\n(the Local tab route element just unmounted)'
            : '📁 Files view\n(the Local tab route element just unmounted)';
          if (leavingLocal) {
            if (mode === 'today') {
              destroyAll();
              log('bad', 'cause ① — Outlet swap → ProductFrame unmounted → <iframe> destroyed. Counter, text, zoom: gone.');
            } else {
              Object.keys(frames).forEach(function (k) { frames[k].classList.add('hidden-frame'); });
              log('ok', 'slot unregistered → frames set display:none. Documents alive — watch the age keep climbing when you come back.');
            }
          }
        } else {
          if (mode === 'today') {
            makeFrame(activeApp);
            showOnly(activeApp);
            log('bad', 'back to Local → a NEW iframe mounts → document reloads from scratch (age back to 0s).');
          } else {
            if (!frames[activeApp]) makeFrame(activeApp);
            showOnly(activeApp);
            log('ok', 'frame re-projected over its slot — same live document, state intact, no reload.');
          }
        }
      });
    });

    /* app switcher */
    $$('#mock-local [data-mapp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var appId = btn.dataset.mapp;
        if (appId === activeApp) return;
        activeApp = appId;
        $$('#mock-local [data-mapp]').forEach(function (b) { b.classList.toggle('active', b === btn); });
        if (mode === 'today') {
          destroyAll();
          makeFrame(appId);
          showOnly(appId);
          log('bad', 'cause ② — src reassigned on the SAME mounted iframe → frame navigates to ' + APPS[appId].title + ' → the other app’s document is destroyed.');
        } else {
          var created = !frames[appId];
          if (created) makeFrame(appId);
          showOnly(appId);
          log('ok', 'slot re-registered under frameKey local:birocode:' + appId + ' — ' +
            (created ? 'new frame created; the other frame stays alive hidden.' : 'existing frame re-shown, state intact; the other stays alive hidden.'));
        }
      });
    });

    /* toolbar refresh */
    $('#mock-toolbar-refresh').addEventListener('click', function () {
      if (studioTab !== 'local') return;
      if (mode === 'today') {
        destroyFrame(activeApp);
        makeFrame(activeApp);
        showOnly(activeApp);
        log('info', 'toolbar refresh → remount (today this is the only refresh, and only the Local tab has it).');
      } else {
        refreshFrame(activeApp);
      }
    });

    /* mode toggle — resets the sim so the comparison is clean */
    $$('#mode-seg button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.mode === mode) return;
        mode = btn.dataset.mode;
        $$('#mode-seg button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        destroyAll();
        studioTab = 'local'; activeApp = 'a';
        $$('#mock-tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.mtab === 'local'); });
        $$('#mock-local [data-mapp]').forEach(function (b) { b.classList.toggle('active', b.dataset.mapp === 'a'); });
        $('#mock-local').hidden = false; $('#mock-other').hidden = true;
        makeFrame('a'); showOnly('a');
        log('info', mode === 'today'
          ? 'mode: main today — every navigation remounts or renavigates the iframe.'
          : 'mode: proposed frame host — frames hide instead of dying; ↻ appears in the corner pill.');
      });
    });

    makeFrame('a'); showOnly('a');
  })();

  /* ================================================================
     VIEW 2 — the frame host stage + real-iframe constraint demo
     ================================================================ */
  (function () {
    var stage = $('#stage');
    var tray = $('#stage-tray');
    var slotLocal = $('#slot-local');
    var slotDock = $('#slot-dock');
    var state = { studio: 'local', dockOpen: false, scrolled: false };
    var hframes = []; // { el, key, slot: () => element|null }

    function makeHFrame(key, note) {
      var el = document.createElement('div');
      el.className = 'hframe';
      el._born = Date.now();
      el.innerHTML = '<div class="hf-head">' + key + '</div>' +
        '<div class="hf-body"><span class="hf-age">alive 0s</span><div class="hf-note">' + note + '</div></div>';
      var ageEl = el.querySelector('.hf-age');
      tickers.push(function () {
        if (!el.isConnected) return false;
        ageEl.textContent = 'alive ' + Math.round((Date.now() - el._born) / 1000) + 's';
      });
      stage.appendChild(el);
      return el;
    }

    function layout() {
      var stageRect = stage.getBoundingClientRect();
      var parkedIdx = 0;
      hframes.forEach(function (f) {
        var slot = f.slot();
        if (slot) {
          var r = slot.getBoundingClientRect();
          f.el.classList.remove('parked');
          f.el.style.top = (r.top - stageRect.top) + 'px';
          f.el.style.left = (r.left - stageRect.left) + 'px';
          f.el.style.width = r.width + 'px';
          f.el.style.height = r.height + 'px';
        } else {
          var t = tray.getBoundingClientRect();
          f.el.classList.add('parked');
          f.el.style.top = (t.top - stageRect.top + 28) + 'px';
          f.el.style.left = (t.left - stageRect.left + 10 + parkedIdx * 210) + 'px';
          f.el.style.width = '196px';
          f.el.style.height = '58px';
          parkedIdx++;
        }
      });
    }
    // the real host tracks via ResizeObserver + scroll listeners; a few staggered
    // relayouts here make the frame visibly chase its slot through the animation
    function layoutSoon() { [0, 120, 260, 420, 520].forEach(function (ms) { setTimeout(layout, ms); }); }

    var fLocal = makeHFrame('local:birocode:app-a', 'the Local tab’s frame — one per app per surface');
    hframes.push({
      el: fLocal, key: 'local',
      slot: function () { return state.studio === 'local' ? slotLocal : null; }
    });

    $('#st-local').addEventListener('click', function () {
      state.studio = 'local';
      $('#st-local').classList.add('active'); $('#st-console').classList.remove('active');
      slotLocal.hidden = false; $('#stage-console').hidden = true;
      layoutSoon();
    });
    $('#st-console').addEventListener('click', function () {
      state.studio = 'console';
      $('#st-console').classList.add('active'); $('#st-local').classList.remove('active');
      slotLocal.hidden = true; $('#stage-console').hidden = false;
      layoutSoon();
    });
    $('#st-dock').addEventListener('click', function () {
      state.dockOpen = !state.dockOpen;
      $('#stage-dock').hidden = !state.dockOpen;
      this.textContent = state.dockOpen ? 'Close the dock' : 'Open same app in a dock';
      if (state.dockOpen && !hframes.some(function (f) { return f.key === 'dock'; })) {
        var fDock = makeHFrame('dock:main:birocode:app-a', 'same app, different surface → its OWN frame (D2)');
        hframes.push({
          el: fDock, key: 'dock',
          slot: function () { return state.dockOpen ? slotDock : null; }
        });
      }
      layoutSoon();
    });
    $('#st-scroll').addEventListener('click', function () {
      state.scrolled = !state.scrolled;
      slotLocal.classList.toggle('scrolled', state.scrolled);
      layoutSoon();
    });

    window.addEventListener('resize', layout);
    $$('#tabs .tab').forEach(function (b) { b.addEventListener('click', layoutSoon); });
    $('#st-local').classList.add('active');
    layoutSoon();

    /* ---- real-iframe re-parenting demo ---- */
    function timerDoc(bg) {
      return '<!doctype html><body style="margin:0;font:13px system-ui;background:' + bg + ';color:#1a2333;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh">' +
        '<div style="font-size:11px;opacity:.65">a REAL &lt;iframe&gt; — its own document</div>' +
        '<div style="font-size:26px;font-family:monospace"><span id="t">0</span>s</div>' +
        '<div style="font-size:11px;opacity:.65">since this document loaded</div>' +
        '<scr' + 'ipt>var s=0;setInterval(function(){document.getElementById("t").textContent=++s;},1000);</scr' + 'ipt>' +
        '</body>';
    }

    var ifA = document.createElement('iframe');
    ifA.setAttribute('srcdoc', timerDoc('#ffe3cf'));
    ifA.setAttribute('title', 're-parent demo');
    $('#rp-a1').appendChild(ifA);
    $('#rp-move-parent').addEventListener('click', function () {
      var target = ifA.parentElement === $('#rp-a1') ? $('#rp-a2') : $('#rp-a1');
      target.appendChild(ifA); // the browser reloads the document — nothing we can do about it
    });

    var cssStage = $('#rp-css-stage');
    var wrapB = document.createElement('div');
    wrapB.className = 'rp-css-wrap';
    var ifB = document.createElement('iframe');
    ifB.setAttribute('srcdoc', timerDoc('#d5f2e0'));
    ifB.setAttribute('title', 'css move demo');
    wrapB.appendChild(ifB);
    cssStage.appendChild(wrapB);
    $('#rp-move-css').addEventListener('click', function () {
      wrapB.classList.remove('hiddenframe');
      wrapB.classList.toggle('atB');
    });
    $('#rp-hide-css').addEventListener('click', function () {
      wrapB.classList.toggle('hiddenframe');
      this.textContent = wrapB.classList.contains('hiddenframe')
        ? 'Show it again — still counting' : 'Toggle display:none';
    });
  })();

  /* ================================================================
     VIEW 3 — registry playground
     ================================================================ */
  (function () {
    var CAP = 6;
    var seq = 0;
    var repo = 'birocode';
    var frames = []; // { key, surface, reloadKey, lastVis, visible }
    var log = makeLogger($('#reg-log'));
    var body = $('#reg-body');

    function keyFor(surface, app) {
      return surface === 'local'
        ? 'local:' + repo + ':' + app
        : 'dock:' + surface.replace('dock', '') + ':' + repo + ':' + app;
    }

    function hideVisible(surface) {
      frames.forEach(function (f) {
        if (f.surface === surface && f.visible) { f.visible = false; f.lastVis = ++seq; }
      });
    }

    function evictIfNeeded(cb) {
      if (frames.length < CAP) { cb(); return; }
      var hidden = frames.filter(function (f) { return !f.visible; });
      hidden.sort(function (a, b) { return a.lastVis - b.lastVis; });
      var victim = hidden[0];
      var row = body.querySelector('[data-key="' + victim.key + '"]');
      log('bad', 'cap ' + CAP + ' reached → evicting least-recently-visible: ' + victim.key + ' (it reloads fresh if opened again).');
      if (row) {
        row.classList.add('evicting');
        setTimeout(function () {
          frames = frames.filter(function (f) { return f !== victim; });
          cb();
        }, 650);
      } else {
        frames = frames.filter(function (f) { return f !== victim; });
        cb();
      }
    }

    function openApp(surface, app) {
      var key = keyFor(surface, app);
      var existing = frames.filter(function (f) { return f.key === key; })[0];
      hideVisible(surface);
      if (existing) {
        existing.visible = true;
        existing.lastVis = ++seq;
        log('ok', key + ' re-shown — same live frame, no reload.');
        render();
      } else {
        evictIfNeeded(function () {
          frames.push({ key: key, surface: surface, reloadKey: 0, lastVis: ++seq, visible: true });
          log('info', key + ' created → loads /api/localview/' + repo + '/app/' + app + '/ (the only load it will ever do without ↻).');
          render();
        });
      }
    }

    function release(prefix, why) {
      var dropped = frames.filter(function (f) { return f.key.indexOf(prefix) === 0; });
      if (!dropped.length) { log('info', why + ' — no matching frames to release.'); render(); return; }
      frames = frames.filter(function (f) { return f.key.indexOf(prefix) !== 0; });
      log('bad', why + ' → released ' + dropped.length + ' frame(s): ' + dropped.map(function (f) { return f.key; }).join(', '));
      render();
    }

    function render() {
      body.innerHTML = '';
      if (!frames.length) {
        var er = document.createElement('tr');
        er.className = 'empty-row';
        er.innerHTML = '<td colspan="5">no frames — open an app above</td>';
        body.appendChild(er);
      }
      var hidden = frames.filter(function (f) { return !f.visible; })
        .sort(function (a, b) { return a.lastVis - b.lastVis; });
      frames.forEach(function (f) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-key', f.key);
        var rank = f.visible ? '—' : (hidden.indexOf(f) === 0 ? '1 · next out' : String(hidden.indexOf(f) + 1));
        tr.innerHTML = '<td>' + f.key + '</td>' +
          '<td><span class="st-chip ' + (f.visible ? 'vis">visible' : 'hid">hidden · alive') + '</span></td>' +
          '<td>' + f.reloadKey + '</td><td>' + rank + '</td>' +
          '<td><button class="row-refresh" title="reload only this frame">↻</button></td>';
        tr.querySelector('.row-refresh').addEventListener('click', function () {
          f.reloadKey++;
          log('info', '↻ ' + f.key + ' → reloadKey ' + f.reloadKey + ' — only this frame gets a fresh document.');
          render();
        });
        body.appendChild(tr);
      });
      $('#cap-count').textContent = String(frames.length);
      var fill = $('#cap-fill');
      fill.style.width = (frames.length / CAP * 100) + '%';
      fill.classList.toggle('full', frames.length >= CAP);
      $$('.reg-btns [data-reg]').forEach(function (b) {
        var parts = b.dataset.reg.split(':');
        var key = keyFor(parts[0], parts[1]);
        b.classList.toggle('on', frames.some(function (f) { return f.key === key && f.visible; }));
      });
      $('#reg-repo').textContent = 'repo: ' + repo;
    }

    $$('.reg-btns [data-reg]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.reg.split(':');
        openApp(parts[0], parts[1]);
      });
    });
    $('#reg-switch-repo').addEventListener('click', function () {
      var old = repo;
      repo = repo === 'birocode' ? 'other-repo' : 'birocode';
      release('local:' + old + ':', 'Local tab switched repo (' + old + ' → ' + repo + ')');
    });
    $('#reg-console').addEventListener('click', function () {
      hideVisible('local');
      log('ok', 'studio → Console: Local-tab slot unregistered — its frames hidden, all kept.');
      render();
    });
    $('#reg-d1-close').addEventListener('click', function () {
      hideVisible('dock1');
      log('ok', 'dock 1 app view closed — slot unregistered, frames kept (same gesture as switching to Builder/Ask).');
      render();
    });
    $('#reg-d2-close').addEventListener('click', function () {
      hideVisible('dock2');
      log('ok', 'dock 2 app view closed — slot unregistered, frames kept.');
      render();
    });
    $('#reg-d1-remove').addEventListener('click', function () { release('dock:1:', 'dock 1 removed from the roster'); });
    $('#reg-d2-remove').addEventListener('click', function () { release('dock:2:', 'dock 2 removed from the roster'); });
    $('#reg-reload').addEventListener('click', function () {
      frames = []; seq = 0; repo = 'birocode';
      log('bad', 'page reload → the host’s React state is gone → every frame released. By design: no persistence.');
      render();
    });

    render();
  })();

  /* ================================================================
     VIEW 4 — the change on paper
     ================================================================ */
  (function () {
    var REQS = [
      {
        n: 'R1', title: 'Frames keep their state across navigation',
        text: 'The system SHALL keep an opened local app’s embedded frame alive — hidden, not unmounted — when the user navigates away from its surface (the Local tab or an agent dock), and SHALL re-show the same live frame when the user returns.',
        scens: [
          ['interact with an app in the Local tab, switch studio tab, return', 'same app, same live frame, state intact — the document never reloaded'],
          ['dock showing an app switches to Builder/Ask/Files/Console (or closes the overlay), then reopens the app view', 'the app appears exactly as it was left, without a reload'],
          ['a multi-pane layout scrolls the hosting surface out of the pane window and back in', 'the frame is re-shown with state intact'],
          ['user set a zoom level, navigates away and back', 'the zoom level is still applied — the same frame instance is re-shown']
        ]
      },
      {
        n: 'R2', title: 'One frame per app per surface',
        text: 'Within one surface, the system SHALL give each opened local app its own frame rather than reassigning src on a shared iframe; the same app on two surfaces gets two independent frames.',
        scens: [
          ['open app A, interact, switch the surface to app B, switch back to A', 'app A is in its original live frame with state intact — and B’s frame stays alive for its own return'],
          ['the same app is open in the Local tab and in a dock at once', 'each surface has its own frame; interacting with one never affects the other']
        ]
      },
      {
        n: 'R3', title: 'Explicit per-frame refresh',
        text: 'The system SHALL provide a refresh control on the embedded frame itself, presented with the existing zoom controls, that reloads only that frame.',
        scens: [
          ['refresh is pressed while two apps have kept-alive frames on the surface', 'only the visible app reloads; the other keeps its state'],
          ['a local app is viewed inside an agent dock', 'a refresh control is available on the frame — the dock previously had none']
        ]
      },
      {
        n: 'R4', title: 'Bounded, ephemeral lifetime',
        text: 'Kept-alive frames SHALL be client-side, in-memory state only — released on repo switch, dock removal, and app deletion, capped by LRU eviction, and gone on page reload.',
        scens: [
          ['the harness web UI is reloaded', 'no kept-alive frames exist; apps load fresh'],
          ['the Local tab’s repo changes while it holds frames for the old repo', 'those frames are released; the old repo’s apps load fresh later'],
          ['opening one more app would exceed the cap', 'the least-recently-visible frame is released; that app reloads fresh if reopened']
        ]
      }
    ];
    var reqList = $('#req-list');
    REQS.forEach(function (r) {
      var d = document.createElement('details');
      d.className = 'req';
      d.innerHTML = '<summary><span class="rq-n">' + r.n + '</span>' + r.title +
        '<span class="rq-count">' + r.scens.length + ' scenarios</span></summary>' +
        '<div class="rq-body"><p class="rq-text">' + r.text + '</p></div>';
      var bodyEl = d.querySelector('.rq-body');
      r.scens.forEach(function (s) {
        var sc = document.createElement('div');
        sc.className = 'scen';
        sc.innerHTML = '<b>WHEN</b><div>' + s[0] + '</div><b>THEN</b><div>' + s[1] + '</div>';
        bodyEl.appendChild(sc);
      });
      reqList.appendChild(d);
    });

    var TASKS = [
      ['1 · Frame host infrastructure', [
        'LocalAppFramesContext — frame registry + acquire/release/refresh/zoom actions',
        'LocalAppFrameHost — fixed full-viewport layer, mounted once in Layout outside the Outlet',
        'Slot projection — ResizeObserver + capture-phase scroll/resize, rAF-batched',
        'Lifetime rules — LRU cap 6, releases on repo change / dock removal / app deletion'
      ]],
      ['2 · ProductFrame split', [
        'Extract iframe + zoom viewport into host-rendered HostedFrame; hoist zoom & reloadKey',
        'ProductFrame stays the shell: liveness probe, offline/empty states, the slot div',
        '↻ button joins the zoom pill cluster; wire to refreshFrame'
      ]],
      ['3 · Surface integration', [
        'Local tab: keys local:<repo>:<app>; switching swaps slot keys, not src',
        'Dock: keys dock:<dockId>:<repo>:<app>; view switches only unregister the slot',
        'PaneStrip: eviction unregisters, never releases; frames re-project on return',
        'Z-index: host below the modal/menu layer'
      ]],
      ['4 · Verification', [
        'Build + run on the isolated preview (self-dev rules)',
        'Playwright: state survives tab switch, dock switch, A↔B',
        'Playwright: per-frame refresh, zoom survival, repo-switch release, clean reload',
        'Update this Understanding app, then hand off for YOUR acceptance test'
      ]]
    ];
    var cols = $('#task-cols');
    TASKS.forEach(function (g) {
      var div = document.createElement('div');
      div.className = 'task-group';
      div.innerHTML = '<h4>' + g[0] + '</h4>';
      g[1].forEach(function (t) {
        var item = document.createElement('div');
        item.className = 'task-item';
        item.innerHTML = '<span class="box">[x]</span><span>' + t + '</span>';
        div.appendChild(item);
      });
      cols.appendChild(div);
    });
  })();

})();
