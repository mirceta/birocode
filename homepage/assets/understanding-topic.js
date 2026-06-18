// Topic 2 — "Use the Understanding app in any agent".
//
// A portable how-to: it teaches ANOTHER agent (in some other repo) how to adopt
// the Understanding-app convention this harness uses — so that when it explains
// something, it also ships a small build-less SPA the harness serves live.
//
// Three pieces: (1) an auto-cycling 3-step flow of what the agent actually does,
// (2) the four-line contract with a code example per rule, (3) a copy-paste
// drop-in starter. All build-less and self-contained — practicing what it preaches.

(function () {
  var H = window.ClaudeWebHome;

  // ---- the 3 steps of the loop, for the animated strip ----
  var STEPS = [
    {
      glyph: '✍️',
      title: 'Agent writes the app',
      sub: 'understanding-app/index.html',
      cap: 'When you explain something non-trivial, also author a tiny SPA at ' +
        'understanding-app/index.html (plus its vendored JS/CSS). Overwrite it each ' +
        'time the explanation changes — it is the rolling-latest entry point.',
    },
    {
      glyph: '🧩',
      title: 'Harness serves it',
      sub: '/api/localview/<repo>/app/understanding/  ·  no-store',
      cap: 'The Claude Web harness exposes the folder under that proxy sub-path with ' +
        'Cache-Control: no-store, so every overwrite shows up on reload. No build step ' +
        'runs — the files are served as-is.',
    },
    {
      glyph: '📱',
      title: 'User sees it live',
      sub: "Local tab · always-on “Understanding” slot",
      cap: 'The End User opens the Local tab and reads your explainer next to your prose. ' +
        'There is no Mermaid/any fallback: a missing index.html is an explicit empty ' +
        'state and a missing asset is a plain 404 — a broken app is visibly broken.',
    },
  ];

  // ---- the four-line contract ----
  var RULES = [
    {
      n: '1',
      title: 'Build-less & self-contained',
      body: 'A folder of static assets — <code>index.html</code> plus its JS/CSS, any ' +
        '<b>vendored</b> libraries, and data files. No CDN, no <code>node_modules</code>, ' +
        'no build step.',
      code: 'understanding-app/\n  index.html\n  app.js\n  styles.css\n  vendor/chart.min.js',
    },
    {
      n: '2',
      title: 'Relative URLs only',
      body: 'Reference assets as <code>./app.js</code>, never <code>/app.js</code>. The harness ' +
        'serves you under a proxy sub-path; a leading slash escapes it and 404s.',
      code: '<!-- ✓ resolves under the sub-path -->\n<script src="./app.js"></script>\n\n' +
        '<!-- ✗ escapes the sub-path → 404 -->\n<script src="/app.js"></script>',
    },
    {
      n: '3',
      title: 'Overwrite the rolling-latest entry',
      body: 'The entry point is always <code>understanding-app/index.html</code>. Overwrite it ' +
        'each time your explanation changes — don’t version filenames.',
      code: '# every revision rewrites the SAME file\nWrite understanding-app/index.html',
    },
    {
      n: '4',
      title: 'Let the harness serve it',
      body: 'You don’t run a server. The harness serves the folder <code>no-store</code> in the ' +
        'Local tab’s always-on <b>Understanding</b> slot. Reachable on every reload.',
      code: 'GET /api/localview/<repo>/app/understanding/\n→ 200  your index.html  (no-store)',
    },
  ];

  // ---- the prompt the operator pastes into the OTHER agent's chat ----
  // A POINTER, not a copy. The other agent is on the SAME box, so it can read the
  // canonical convention straight off disk — no need to carry the whole contract in
  // the paste, and no copy to drift out of sync. One source of truth: the doc below.
  var CONVENTION_DOC =
    'C:\\Users\\Administrator\\Desktop\\playground\\birocode\\docs\\understanding-app-convention.md';
  var PROMPT_TEXT =
    'Read the file `' + CONVENTION_DOC + '` and follow the convention it describes from ' +
    'now on: whenever you explain something non-trivial to me, also ship the small ' +
    'build-less Understanding app it specifies (overwrite `understanding-app/index.html` ' +
    'at the repo root), on top of replying in prose. The doc is the single source of ' +
    'truth — re-read it if the convention ever changes.';

  // ---- drop-in starter the other agent can paste ----
  var STARTER_HTML =
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="utf-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '  <title>Understanding — &lt;what you explained&gt;</title>\n' +
    '  <link rel="stylesheet" href="./styles.css" />   <!-- relative! -->\n' +
    '</head>\n' +
    '<body>\n' +
    '  <h1>What I understood</h1>\n' +
    '  <div id="app"></div>\n' +
    '  <script src="./app.js"></script>           <!-- relative! -->\n' +
    '</body>\n' +
    '</html>';

  function mount(root) {
    root.classList.add('topic--understanding');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'A portable how-to for <b>another agent, in another repo</b>: teach it to ship an ' +
      '<em>Understanding app</em> — a small build-less SPA the harness serves live whenever ' +
      'it explains something non-trivial. The whole convention is four lines — and because ' +
      'that agent runs on <b>this same box</b>, you don’t paste the four lines at all: you ' +
      'point it at the one on-disk doc that holds them.';
    root.appendChild(lead);

    // ----- paste-this-into-the-other-agent prompt -----
    var promptWrap = H.el('div', 'ut-prompt');
    var pHead = H.el('div', 'ut-prompt__head');
    var pTitle = H.el('div', 'ut-prompt__title');
    pTitle.innerHTML = '🚀 Paste this into the other agent’s chat';
    var copyBtn = H.el('button', 'ut-prompt__copy', 'Copy');
    copyBtn.type = 'button';
    pHead.appendChild(pTitle);
    pHead.appendChild(copyBtn);
    var pBody = H.el('pre', 'ut-code ut-prompt__body');
    pBody.appendChild(H.el('code', null, PROMPT_TEXT));
    promptWrap.appendChild(pHead);
    promptWrap.appendChild(pBody);
    root.appendChild(promptWrap);

    var why = H.el('div', 'ut-note');
    why.innerHTML =
      '<b>Why it’s a pointer, not the whole contract:</b> the other agent is on the ' +
      '<b>same box</b>, so it reads the canonical doc off disk. One source of truth — change ' +
      'the convention in that file and every agent picks it up, with no pasted copy left to ' +
      'drift. The four lines below are that doc, shown here for reference.';
    root.appendChild(why);

    var copyReset = null;
    copyBtn.addEventListener('click', function () {
      function flash(label, ok) {
        copyBtn.textContent = label;
        copyBtn.classList.toggle('is-ok', !!ok);
        copyBtn.classList.toggle('is-err', !ok);
        if (copyReset) clearTimeout(copyReset);
        copyReset = setTimeout(function () {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('is-ok', 'is-err');
        }, 1600);
      }
      function fallback() {
        try {
          var r = document.createRange();
          r.selectNodeContents(pBody);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          var done = document.execCommand('copy');
          sel.removeAllRanges();
          flash(done ? 'Copied ✓' : 'Press ⌘/Ctrl+C', done);
        } catch (e) {
          flash('Press ⌘/Ctrl+C', false);
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(PROMPT_TEXT).then(
          function () { flash('Copied ✓', true); },
          fallback
        );
      } else {
        fallback();
      }
    });

    // ----- animated 3-step strip -----
    var flow = H.el('div', 'ut-flow');
    var stepsRow = H.el('div', 'ut-steps');
    var cards = STEPS.map(function (s, idx) {
      var c = H.el('div', 'node ut-step');
      c.innerHTML =
        '<div class="node__glyph">' + s.glyph + '</div>' +
        '<div class="node__title">' + s.title + '</div>' +
        '<div class="node__sub">' + s.sub + '</div>';
      stepsRow.appendChild(c);
      if (idx < STEPS.length - 1) stepsRow.appendChild(H.el('div', 'ut-arrow', '→'));
      return c;
    });
    var caption = H.el('div', 'caption');
    var capLabel = H.el('div', 'caption__label');
    var capDetail = H.el('div', 'caption__detail');
    caption.appendChild(capLabel);
    caption.appendChild(capDetail);
    flow.appendChild(stepsRow);
    flow.appendChild(caption);
    root.appendChild(flow);

    var i = 0, timer = null, paused = false;
    function paint() {
      cards.forEach(function (c, idx) { c.classList.toggle('is-hot', idx === i); });
      capLabel.innerHTML = '<span class="res">Step ' + (i + 1) + ' / ' + STEPS.length +
        '</span> · ' + STEPS[i].title;
      capDetail.textContent = STEPS[i].cap;
    }
    function tick() { i = (i + 1) % STEPS.length; paint(); }
    function start() { if (!timer) timer = setInterval(function () { if (!paused) tick(); }, 2800); }
    flow.addEventListener('mouseenter', function () { paused = true; });
    flow.addEventListener('mouseleave', function () { paused = false; });
    paint();
    start();

    // ----- the four-line contract -----
    root.appendChild(H.el('h3', 'ut-h', 'The four-line contract'));
    var grid = H.el('div', 'ut-grid');
    RULES.forEach(function (r) {
      var card = H.el('div', 'ut-rule');
      card.innerHTML =
        '<div class="ut-rule__head"><span class="ut-rule__n">' + r.n + '</span>' +
        '<span class="ut-rule__title">' + r.title + '</span></div>' +
        '<p class="ut-rule__body">' + r.body + '</p>';
      var pre = H.el('pre', 'ut-code');
      pre.appendChild(H.el('code', null, r.code));
      card.appendChild(pre);
      grid.appendChild(card);
    });
    root.appendChild(grid);

    // ----- drop-in starter -----
    root.appendChild(H.el('h3', 'ut-h', 'Drop-in starter'));
    var starterWrap = H.el('div', 'ut-starter');
    var fileBar = H.el('div', 'ut-starter__bar', 'understanding-app/index.html');
    var pre = H.el('pre', 'ut-code ut-code--block');
    pre.appendChild(H.el('code', null, STARTER_HTML));
    starterWrap.appendChild(fileBar);
    starterWrap.appendChild(pre);
    root.appendChild(starterWrap);

    var note = H.el('div', 'ut-note');
    note.innerHTML =
      '<b>Why it’s safe to keep simple:</b> there is no fallback renderer. If you forget the ' +
      'file you get an explicit empty state; a wrong (absolute) URL is a plain 404. Broken is ' +
      'always visibly broken — never silently masked. So a tiny correct app beats a clever fragile one.';
    root.appendChild(note);

    return { destroy: function () { if (timer) clearInterval(timer); } };
  }

  H.register({
    id: 'understanding-app',
    label: '📦 Use the Understanding app in any agent',
    tabDesc: 'teach the convention',
    mount: mount,
  });
})();
