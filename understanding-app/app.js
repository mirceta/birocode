// Understanding app — local-app-overlay-keep-composer (revised scope).
// Four views: interactive dock demo (all three alternate views), the render
// conditional with the shared altViewActive condition, the design decisions,
// and the artifacts + the strict-validator first-line gotcha.
// All state is client-side; no network calls.

(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ============ tabs ============ */
  $$('#tabs .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('#tabs .tab').forEach(function (b) { b.classList.remove('tab--active'); });
      btn.classList.add('tab--active');
      $$('.view').forEach(function (v) { v.classList.remove('view--active'); });
      $('#view-' + btn.dataset.view).classList.add('view--active');
    });
  });

  var VIEW_LABEL = {
    console: '📊 Event Console',
    files: '📁 Files browser',
    app: '🚀 my-app (ProductFrame)'
  };

  /* =========================================================
     VIEW 1 — two simulated docks (before / after)
     ========================================================= */
  function makePhone(opts) {
    // opts: { tag, mode: 'before'|'after' }
    var root = document.createElement('div');
    root.className = 'phone phone--' + opts.mode;
    root.innerHTML =
      '<div class="phone__tag">' + opts.tag + '</div>' +
      '<div class="phone__shell">' +
      '  <div class="phone__switcher">' +
      '    <button class="sw" data-v="console">📊 Console</button>' +
      '    <button class="sw" data-v="files">📁 Files</button>' +
      '    <button class="sw" data-v="app">🚀 my-app</button>' +
      '  </div>' +
      '  <div class="phone__screen"></div>' +
      '</div>' +
      '<div class="phone__status"></div>';

    var screen = $('.phone__screen', root);
    var status = $('.phone__status', root);
    var view = 'chat';                       // 'chat' | 'console' | 'files' | 'app'
    var messages = [
      { who: 'user', text: 'Add a dark mode toggle to the settings page.' },
      { who: 'agent', text: 'Done — added the toggle and wired it to the theme context.' }
    ];
    var streaming = null;                    // {text, shown} while a reply "streams"
    var draft = '';

    function setStatus(html) { status.innerHTML = html; }

    function buildAltView(v) {
      if (v === 'app') {
        var frame = document.createElement('div');
        frame.className = 'sim-frame';
        frame.innerHTML = '<div class="spin"></div><b>my-app</b><span>&lt;ProductFrame&gt; — the local app, proxied by the harness</span>';
        return frame;
      }
      var alt = document.createElement('div');
      alt.className = 'sim-alt sim-alt--' + v;
      alt.innerHTML = v === 'console'
        ? '<b>📊 Event Console</b><span>tool calls · turns · errors</span>'
        : '<b>📁 Files browser</b><span>repo tree · diffs</span>';
      return alt;
    }

    function render() {
      screen.innerHTML = '';
      $$('.sw', root).forEach(function (b) {
        b.classList.toggle('sw--on', b.dataset.v === view);
      });

      if (view !== 'chat') {
        var altEl = buildAltView(view);
        screen.appendChild(altEl);

        if (opts.mode === 'before') {
          // Today: ANY alternate view unmounts the chat — composer gone.
          var gone = document.createElement('div');
          gone.className = 'sim-gone';
          gone.textContent = '⚠ Chat unmounted — no composer. Close the view to type.';
          screen.appendChild(gone);
        } else {
          // After: composer-only chat below whichever view is open.
          screen.appendChild(buildComposer());
          if (streaming) {
            var badge = document.createElement('div');
            badge.className = 'bg-stream';
            badge.textContent = 'agent streaming';
            altEl.appendChild(badge);
          }
        }
        return;
      }

      // Full chat: bar + body + composer.
      var bar = document.createElement('div');
      bar.className = 'sim-bar';
      bar.innerHTML = '<span class="dot"></span> agent · feat-branch <span style="margin-left:auto">⋯</span>';
      screen.appendChild(bar);

      var body = document.createElement('div');
      body.className = 'sim-body';
      messages.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'msg msg--' + m.who;
        el.textContent = m.text;
        body.appendChild(el);
      });
      if (streaming) {
        var s = document.createElement('div');
        s.className = 'msg msg--agent msg--streaming';
        s.textContent = streaming.text.slice(0, streaming.shown);
        body.appendChild(s);
      }
      screen.appendChild(body);
      body.scrollTop = body.scrollHeight;

      screen.appendChild(buildComposer());
    }

    function buildComposer() {
      var c = document.createElement('div');
      c.className = 'sim-composer';
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Message the agent…';
      input.value = draft;
      input.addEventListener('input', function () { draft = input.value; });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
      var btn = document.createElement('button');
      btn.textContent = 'Send';
      btn.disabled = !!streaming;
      btn.addEventListener('click', send);
      c.appendChild(input); c.appendChild(btn);
      return c;
    }

    function send() {
      if (streaming) return;
      var text = draft.trim() || 'Also make the toggle remember my choice.';
      draft = '';
      messages.push({ who: 'user', text: text });
      streaming = { text: 'On it — persisting the theme choice to localStorage and re-reading it on load… done.', shown: 0 };
      if (view !== 'chat' && opts.mode === 'after') {
        setStatus('<span class="ok">✓ Prompt sent — the ' + (view === 'app' ? 'app' : view === 'console' ? 'Console' : 'Files view') + ' stays open, turn streams behind it.</span>');
      } else {
        setStatus('<span class="ok">✓ Prompt sent.</span>');
      }
      var timer = setInterval(function () {
        if (!streaming) { clearInterval(timer); return; }
        streaming.shown += 3;
        if (streaming.shown >= streaming.text.length) {
          messages.push({ who: 'agent', text: streaming.text });
          streaming = null;
          clearInterval(timer);
          if (view !== 'chat' && opts.mode === 'after') {
            setStatus('<span class="ok">✓ Turn finished in the background — close the view to see it.</span>');
          }
        }
        render();
      }, 60);
      render();
    }

    $$('.sw', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.v;
        var from = view;
        view = (view === v) ? 'chat' : v;   // toggle off restores chat
        if (view !== 'chat') {
          if (opts.mode === 'before') {
            var lost = draft.trim();
            draft = '';                     // unmount wipes the composer's draft
            setStatus('<span class="bad">✗ Composer gone — the whole chat was swapped out (unmounted).' +
              (lost ? ' Your draft was lost with it.' : '') + '</span>');
          } else if (from !== 'chat') {
            setStatus('<span class="ok">Switched ' + VIEW_LABEL[from] + ' → ' + VIEW_LABEL[view] +
              ' — same chat instance, draft intact.</span>');
          } else {
            setStatus('<span class="ok">' + VIEW_LABEL[view] + ' covers bar + messages; composer stays below. Try typing or sending.</span>');
          }
        } else {
          setStatus('Full chat restored' + (opts.mode === 'after' ? ' — state preserved (never unmounted).' : '.'));
        }
        render();
      });
    });

    setStatus(opts.mode === 'before'
      ? 'This is main today. Open any view — Console, Files, or 🚀 my-app.'
      : 'This is the proposed behavior. Type a draft, then open any view.');
    render();
    return root;
  }

  var phones = $('#phones');
  phones.appendChild(makePhone({ mode: 'before', tag: 'Before — main today' }));
  phones.appendChild(makePhone({ mode: 'after', tag: 'After — this change' }));

  /* =========================================================
     VIEW 2 — the render conditional
     ========================================================= */
  var COND = {
    before: [
      '<span class="cm">// PinnedAgent.jsx — .phone__screen renders ONE child</span>',
      '<span data-l="console" class="old"><span class="kw">showConsole</span> ? <span class="tg">&lt;EventConsole/&gt;</span>   <span class="cm">// chat UNMOUNTS</span></span>',
      '<span data-l="files" class="old">: <span class="kw">showFiles</span>   ? <span class="tg">&lt;FilesBrowser/&gt;</span>   <span class="cm">// chat UNMOUNTS</span></span>',
      '<span data-l="app" class="old">: <span class="kw">openApp</span>     ? <span class="tg">&lt;ProductFrame/&gt;</span>   <span class="cm">// chat UNMOUNTS</span></span>',
      '<span data-l="chat">: <span class="tg">&lt;Chat embedded/&gt;</span></span>'
    ],
    after: [
      '<span class="cm">// PinnedAgent.jsx — ALL THREE branches change</span>',
      '<span data-l="cond"><span class="kw">const</span> altViewActive = showConsole || showFiles || openApp</span>',
      '',
      '<span data-l="console" class="new">{<span class="kw">showConsole</span> && <span class="tg">&lt;EventConsole/&gt;</span>}   <span class="cm">// flex: 1</span></span>',
      '<span data-l="files" class="new">{<span class="kw">showFiles</span>   && <span class="tg">&lt;FilesBrowser/&gt;</span>}</span>',
      '<span data-l="app" class="new">{<span class="kw">openApp</span>     && <span class="tg">&lt;ProductFrame/&gt;</span>}</span>',
      '<span data-l="chat" class="new"><span class="tg">&lt;Chat embedded composerOnly=</span>{altViewActive}<span class="tg">/&gt;</span> <span class="cm">// ONE instance</span></span>'
    ]
  };

  var NOTES = {
    console: {
      before: { note: 'Today the Event Console REPLACES the chat — <Chat> unmounts, taking the composer and its live state with it.', cap: 'One child: the console. The composer is not hidden — it is gone.' },
      after: { note: 'After: the console renders above the shared composer-only Chat. Same pattern as the other two views — one condition covers them all.', cap: 'Console on top, live composer below. Chat never unmounts.' }
    },
    files: {
      before: { note: 'Today the Files browser REPLACES the chat — same unmount, same lost composer.', cap: 'One child: the files browser. No composer.' },
      after: { note: 'After: the files browser renders above the same shared composer-only Chat element.', cap: 'Files on top, live composer below. Chat never unmounts.' }
    },
    app: {
      before: { note: 'Today the app REPLACES the chat — <Chat> unmounts. No overlay exists; it’s a swap. This was the original scope of the change.', cap: 'ProductFrame is the only child. No composer.' },
      after: { note: 'After: the frame renders above the shared composer-only Chat — the frame takes remaining height, the composer keeps its natural height.', cap: 'Frame on top, live composer below. Streaming continues behind it.' }
    },
    chat: {
      before: { note: 'Default: the full embedded chat — bar, message list, composer.', cap: 'Bar + body + composer. This is what you lose today when any view opens.' },
      after: { note: 'No view open → altViewActive is false → composerOnly is off → the same Chat element shows its full self. Switching views toggles a prop, never remounts.', cap: 'Bar + body + composer — the same element that was composer-only a moment ago.' }
    }
  };

  var mode = 'before', state = 'chat';

  function renderCond() {
    $('#condCode').innerHTML = COND[mode].join('\n');
    $$('#condCode [data-l]').forEach(function (el) {
      var l = el.getAttribute('data-l');
      var hit = (l === state) ||
        (mode === 'after' && state !== 'chat' && (l === 'chat' || l === 'cond'));
      if (hit) el.classList.add('hl');
    });
    $$('#condStates .cond-state').forEach(function (b) {
      b.classList.toggle('cond-state--active', b.dataset.state === state);
    });

    var meta = NOTES[state][mode];
    $('#condNote').innerHTML = meta.note;
    $('#miniCaption').textContent = meta.cap;

    var screen = $('#miniScreen');
    screen.innerHTML = '';
    function part(cls, label) {
      var d = document.createElement('div');
      d.className = 'mini-part mini-part--' + cls;
      d.textContent = label;
      screen.appendChild(d);
    }
    if (state === 'chat') {
      part('bar', 'chat bar');
      part('body', 'messages');
      part('composer', '✍ composer');
    } else {
      if (state === 'console') part('console', '📊 Event Console');
      else if (state === 'files') part('files', '📁 Files');
      else part('frame', '🚀 ProductFrame');
      if (mode === 'after') part('composer', '✍ composer (Chat, composerOnly)');
    }
  }

  $$('#beforeAfter .seg__btn').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.mode;
      $$('#beforeAfter .seg__btn').forEach(function (x) { x.classList.toggle('seg__btn--active', x === b); });
      renderCond();
    });
  });
  $$('#condStates .cond-state').forEach(function (b) {
    b.addEventListener('click', function () { state = b.dataset.state; renderCond(); });
  });
  renderCond();

  /* =========================================================
     VIEW 3 — design decisions + scope + risks
     ========================================================= */
  var OPTIONS = [
    {
      tag: 'Decision 1', cls: 'chosen',
      title: 'Composer-only mode ON Chat, not a ChatInput extraction',
      body: '<p>A new <code>composerOnly</code> prop adds a <code>chat--composer-only</code> class; ' +
        'CSS hides the bar and the message list, leaving only <code>.chat-input</code>.</p>' +
        '<p><b>Why:</b> all send / stop / queue state lives in <code>Chat.jsx</code>, so keeping it ' +
        'mounted gives a fully working composer for free. Extracting <code>ChatInput</code> standalone ' +
        'was rejected (big risky refactor); absolutely positioning the view over <code>.chat__body</code> ' +
        'was rejected (fragile z-index coupling to chat internals).</p>'
    },
    {
      tag: 'Decision 2', cls: 'chosen',
      title: 'Flex stacking, not overlay',
      body: '<p>The alternate view and the composer strip are <b>siblings</b> in the existing ' +
        '<code>.phone__screen</code> flex column — view takes remaining height, composer keeps its ' +
        'natural height. No z-index or absolute positioning introduced.</p>'
    },
    {
      tag: 'Decision 3', cls: 'chosen',
      title: 'Chat chrome hidden, not unmounted',
      body: '<p><code>.chat__bar</code> and <code>.chat__body</code> go to <code>display:none</code> ' +
        'but stay in the tree — refs, effects and streaming state survive. Any effect that measures ' +
        'the hidden list (autoscroll, resize observers) gets guarded on the prop.</p>'
    },
    {
      tag: 'Decision 4 · rewritten', cls: 'revised', open: true,
      title: 'One shared altViewActive condition for all three branches',
      body: '<p><b>This is what the revision changed.</b> Previously: "scope stays in the openApp ' +
        'branch; Console/Files untouched." Now all three branches go from "view <em>instead of</em> ' +
        'chat" to "view <em>plus</em> composer-only chat".</p>' +
        '<p>Crucially the <code>&lt;Chat embedded composerOnly&gt;</code> element is rendered ' +
        '<b>once</b>, driven by <code>altViewActive = openApp || showConsole || showFiles</code> — ' +
        'not duplicated per branch. So when the operator switches directly between views ' +
        '(Console → Files → app), React keeps the same chat instance: no remount, no lost draft, ' +
        'no interrupted stream.</p>'
    }
  ];

  var optsRoot = $('#options');
  OPTIONS.forEach(function (o) {
    var el = document.createElement('div');
    el.className = 'option option--' + o.cls + (o.open ? ' option--open' : '');
    el.innerHTML =
      '<div class="option__head">' +
      '  <span class="option__verdict">' + o.tag + '</span>' +
      '  <span class="option__title">' + o.title + '</span>' +
      '  <span class="option__chevron">›</span>' +
      '</div>' +
      '<div class="option__body">' + o.body + '</div>';
    el.addEventListener('click', function () { el.classList.toggle('option--open'); });
    optsRoot.appendChild(el);
  });

  var SCOPE = [
    { t: 'Standalone Local tab', p: 'LocalApp.jsx keeps rendering apps full-body. Composer-under-view is dock-only — the one exclusion left after the revision.' },
    { t: 'Backend / API / UI-mode gating', p: 'Frontend-only. Each dock view keeps the same UI-mode gate that governs it today.' },
    { t: 'Chat history peek while a view is open', p: 'Explicit non-goal — composer only, no mini message list.' }
  ];
  var scopeRoot = $('#scope');
  SCOPE.forEach(function (s) {
    var d = document.createElement('div');
    d.className = 'scope__card';
    d.innerHTML = '<b>' + s.t + '</b><p>' + s.p + '</p>';
    scopeRoot.appendChild(d);
  });

  var RISKS = [
    { t: 'Effects vs. hidden body', p: 'Autoscroll / resize observers may misbehave at display:none → guard on the composerOnly prop; verify by streaming a turn while a view is open.' },
    { t: 'Composer-only styling', p: '.chat--embedded .chat-input border/radius assumptions may look off as the lone visible child → style in dashboard.css, verify visually.' },
    { t: 'Views’ bottom chrome · new', p: 'Console/Files may have their own toolbars or action rows now sitting directly above the composer → check spacing per view so the stacked strips read as separate surfaces.', hot: true },
    { t: 'Maximize-chat toggle', p: 'Composer-only mode wins while a view is open; closing it returns to whichever layout state the dock had.' }
  ];
  var risksRoot = $('#risks');
  RISKS.forEach(function (r) {
    var d = document.createElement('div');
    d.className = 'risk__card' + (r.hot ? ' risk__card--hot' : '');
    d.innerHTML = '<b>' + r.t + '</b><p>' + r.p + '</p>';
    risksRoot.appendChild(d);
  });

  /* ---- flex diagram view picker ---- */
  var FLEX_NAMES = { app: '&lt;ProductFrame&gt;', console: '&lt;EventConsole&gt;', files: '&lt;FilesBrowser&gt;' };
  $$('#flexPicker button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      $$('#flexPicker button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#flexViewName').innerHTML = FLEX_NAMES[b.dataset.v];
      var fv = $('#flexView');
      fv.className = 'flexitem flexitem--frame flexitem--v-' + b.dataset.v;
    });
  });

  /* =========================================================
     VIEW 4 — pipeline + artifacts + validator gotcha
     ========================================================= */
  var STAGES = [
    { n: 'propose', done: true },
    { n: 'specify', done: true },
    { n: 'design', done: true },
    { n: 'implement', now: true },
    { n: 'archive' }
  ];
  var pipeRoot = $('#pipeline');
  STAGES.forEach(function (s, i) {
    var wrap = document.createElement('div');
    wrap.className = 'pipe' + (s.done ? ' pipe--done' : '') + (s.now ? ' pipe--now' : '');
    wrap.innerHTML = (i ? '<span class="pipe__link"></span>' : '') +
      '<span class="pipe__node">' + (s.done ? '✓ ' : s.now ? '▶ ' : '') + s.n + '</span>';
    pipeRoot.appendChild(wrap);
  });
  var badge = document.createElement('span');
  badge.className = 'pipe__badge';
  badge.textContent = '✓ openspec validate --strict — valid · 4/4 artifacts revised';
  pipeRoot.appendChild(badge);

  var ARTIFACTS = [
    {
      icon: '💡', name: 'proposal.md', file: 'proposal.md', open: true,
      body: '<p><b>Reframed:</b> "local app keeps the composer" → "<b>alternate dock views</b> keep ' +
        'the composer". Opening a local app, the Event Console, <em>or</em> the Files browser leaves ' +
        'the composer usable below it; sending doesn’t close the view.</p>' +
        '<p><b>Only exclusion left:</b> the standalone Local tab keeps full-screen behavior.</p>'
    },
    {
      icon: '📐', name: 'specs — agent-dock delta', file: 'specs/agent-dock/spec.md',
      body: '<p>Two <span class="req">ADDED</span> requirements:</p><ul>' +
        '<li><span class="req">Alternate dock views keep the chat composer visible</span> — now ' +
        '<b>5 scenarios</b>: one per view (app / Console / Files leaves the composer), plus ' +
        'send-while-open and close-restores-chat.</li>' +
        '<li><span class="req">Applies only to the agent dock</span> — the Local tab is unchanged; ' +
        'each view keeps its UI-mode gate. The old "Console and Files are unchanged" requirement ' +
        'is <b>gone</b> — it would now contradict the change itself.</li></ul>'
    },
    {
      icon: '📐', name: 'design.md', file: 'design.md',
      body: '<p>Same approach, generalized: the active view and one shared ' +
        '<code>&lt;Chat embedded composerOnly&gt;</code> are flex siblings.</p><ul>' +
        '<li>Decision 4 rewritten: <code>altViewActive = openApp || showConsole || showFiles</code>, ' +
        'chat rendered once → <b>no remount when switching views</b>.</li>' +
        '<li>New risk: each view’s bottom chrome (toolbars/action rows) now sits directly above ' +
        'the composer — check spacing per view.</li>' +
        '<li>Non-goals trimmed: "no change to Console/Files" removed; Local tab exclusion stays.</li></ul>'
    },
    {
      icon: '☑', name: 'tasks.md — 10 tasks', file: 'tasks.md',
      body: '<div class="art__group">1. Composer-only chat mode</div><ul class="art__tasks">' +
        '<li>composerOnly prop on Chat.jsx (chat--composer-only class)</li>' +
        '<li>CSS: hide .chat__bar / .chat__body, style the lone composer</li>' +
        '<li>Guard effects that break at display:none</li></ul>' +
        '<div class="art__group">2. Dock layout change <span class="art__delta">· restructured</span></div><ul class="art__tasks">' +
        '<li>Single altViewActive condition; active view above ONE shared Chat</li>' +
        '<li>Verify no remount when switching Console → Files → app</li>' +
        '<li>Flex sizing per view + bottom-chrome check in dashboard.css</li></ul>' +
        '<div class="art__group">3. Verify <span class="art__delta">· per view</span></div><ul class="art__tasks">' +
        '<li>npm --prefix client run build</li>' +
        '<li>Browser-verify cover / send / close-restores for EACH of the three views</li>' +
        '<li>Standalone Local tab still full-body</li>' +
        '<li>openspec validate --strict</li></ul>'
    }
  ];
  var artRoot = $('#artifacts');
  ARTIFACTS.forEach(function (a) {
    var el = document.createElement('div');
    el.className = 'art' + (a.open ? ' art--open' : '');
    el.innerHTML =
      '<div class="art__head">' +
      '  <span class="art__icon">' + a.icon + '</span>' +
      '  <span class="art__name">' + a.name + '</span>' +
      '  <span class="art__file">' + a.file + '</span>' +
      '</div>' +
      '<div class="art__body">' + a.body + '</div>';
    el.addEventListener('click', function () { el.classList.toggle('art--open'); });
    artRoot.appendChild(el);
  });

  /* ---- validator gotcha toggle ---- */
  var GOTCHA = {
    fail: {
      code:
        '<span class="cm">### Requirement: Alternate dock views keep the chat composer visible</span>\n' +
        '\n' +
        '<span class="gline">When the operator opens any of the agent dock’s alternate views — a local app from the app</span>  <span class="gmark gmark--bad">← line 1: no SHALL</span>\n' +
        'switcher, the Event Console, or the Files browser — the system <span class="gshall">SHALL</span> render that view over the  <span class="gmark">← SHALL is here… on line 3</span>\n' +
        'dock screen’s chat area — …',
      note: '✗ <b>ERROR</b>: ADDED "Alternate dock views…" must contain SHALL or MUST — the validator takes ' +
        'only the FIRST LINE as the requirement text (visible in <code>openspec change show --json --deltas-only</code>: ' +
        '<code>"text": "When the operator opens any of the agent dock’s alternate views — a local app from the app"</code>).'
    },
    pass: {
      code:
        '<span class="cm">### Requirement: Alternate dock views keep the chat composer visible</span>\n' +
        '\n' +
        '<span class="gline gline--ok">The system <span class="gshall">SHALL</span> keep the chat composer (the prompt text box and its Send/Stop control)</span>  <span class="gmark gmark--ok">← SHALL on line 1</span>\n' +
        'visible and usable at the bottom of the dock screen whenever the operator opens any of the\n' +
        'agent dock’s alternate views — …',
      note: '✓ Fix: restructure the sentence so SHALL sits at the front, on the first physical line. ' +
        'Same meaning, validator-visible. <code>openspec validate --strict</code> → <b>valid</b>. ' +
        'Rule of thumb for delta specs: <b>lead every requirement with "The system SHALL …"</b> — never let line-wrap push the keyword down.'
    }
  };
  function renderGotcha(which) {
    $('#gotchaCode').innerHTML = GOTCHA[which].code;
    $('#gotchaNote').innerHTML = GOTCHA[which].note;
  }
  $$('#gotchaSeg .seg__btn').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#gotchaSeg .seg__btn').forEach(function (x) { x.classList.toggle('seg__btn--active', x === b); });
      renderGotcha(b.dataset.g);
    });
  });
  renderGotcha('fail');

})();
