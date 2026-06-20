// Topic 3 — "Ask an agent to add a system test".
//
// The operator fills a small FORM (what behaviour, how to reproduce, expected,
// and optionally the buggy actual) and the paste-ready prompt is GENERATED live
// from it. No placeholders to hand-edit — so the operator can't forget to swap a
// `<…>` before pasting into another agent. Copy stays disabled until the required
// fields are filled, and any still-missing field shows up highlighted in the
// preview. Like the Understanding-app topic, the generated prompt is a POINTER to
// the on-disk convention (tests/chat-systest/README.md + plans/chat-system-tests.md)
// for the HOW — the form only collects the WHAT, because only the operator knows
// the bug.
//
// Build-less and self-contained — reuses the shared ut-* styles plus a small
// systf-* form block in styles.css.

(function () {
  var H = window.ClaudeWebHome;

  // ---- the convention the generated prompt points at (single source of truth) --
  // Repo-relative on purpose: the agent reading it already works IN this repo.
  var CONVENTION = 'tests/chat-systest/README.md';
  var PLAN = 'plans/chat-system-tests.md';

  // A guillemet-wrapped marker means "required field still empty". It only ever
  // appears for a missing required field, so it's safe to (a) highlight in the
  // preview and (b) treat its absence as "ready to copy".
  var MISSING_RE = /‹[^›]*›/g;

  // ---- the form fields the operator fills in ---------------------------------
  var FIELDS = [
    {
      key: 'what', label: 'WHAT — which behaviour', required: true, multiline: false,
      hint: 'The exact surface under test — a route, a lane (builder/ask), or an SSE ' +
        'event (session/token/tool/usage/done/error). Not “chat is broken”.',
      placeholder: 'POST /api/chat/stop while a builder run is live',
      missing: 'describe WHICH behaviour above',
    },
    {
      key: 'repro', label: 'REPRODUCE — how to trigger it', required: true, multiline: true,
      hint: 'Numbered steps the way the frontend drives it (HTTP calls + SSE reads). ' +
        'These map almost line-for-line onto the test body.',
      placeholder: '1) login\n2) start a builder turn\n3) POST /api/chat/stop\n4) GET /api/runs',
      missing: 'list the REPRODUCE steps above',
    },
    {
      key: 'expected', label: 'EXPECTED — what correct looks like', required: true, multiline: true,
      hint: 'The observable result a correct system must produce — this becomes the ' +
        'check() assertion the test passes or fails on.',
      placeholder: "/api/runs shows status 'stopped' and no further usage events",
      missing: 'state the EXPECTED result above',
    },
    {
      key: 'actual', label: 'ACTUAL — what happens today', required: false, multiline: true,
      onlyIfBug: true,
      hint: 'Only when this is a bug: the wrong behaviour you see now. Becomes the ' +
        'failing check and the one-line repro in the findings.',
      placeholder: "/api/runs shows status 'error', indistinguishable from a crash",
      missing: 'describe the ACTUAL (buggy) behaviour above',
    },
  ];

  // ---- what the agent does after you paste (animated strip) -------------------
  var STEPS = [
    {
      glyph: '📖',
      title: 'Reads the convention',
      sub: CONVENTION + '  ·  ' + PLAN,
      cap: 'The agent opens the on-disk convention first: black-box over real HTTP/SSE, the ' +
        'shared lib.mjs helpers, and the ISOLATED-instance rule (fresh CLAUDEWEB_DATADIR, own ' +
        'port, throwaway scratch repo) so it never touches the live :5099 store.',
    },
    {
      glyph: '✍️',
      title: 'Writes the test',
      sub: 'a .mjs using check()/report(), placed by token cost',
      cap: 'It turns your REPRODUCE steps into a script with lib.mjs, asserts your EXPECTED with ' +
        'check(), and drops it in the right suite (behavioural = free; smoke/realrun/badinput = ' +
        'real CLI) — then registers the scenario in hub/suites.json.',
    },
    {
      glyph: '▶️',
      title: 'Runs it isolated',
      sub: 'fresh datadir + own port + scratch repo',
      cap: 'It launches an isolated instance and runs the suite, streaming a PASS/FAIL line per ' +
        'check and a findings summary. The live store is never in the loop, so real CLI turns ' +
        'cost nothing that matters.',
    },
    {
      glyph: '🐞',
      title: 'Records, doesn’t fix',
      sub: 'one-line repro in findings · fix = separate branch',
      cap: 'A confirmed bug gets a one-line repro in the findings (and the hub). The agent does ' +
        'NOT fix the product here — discovery and fixes are different features, and each fix ' +
        'spins out to its own branch off main.',
    },
  ];

  // ---- prompt generation ------------------------------------------------------
  // Renders one "- LABEL: …" block: inline if single-line, indented block if the
  // value spans lines, and a highlighted marker if a required field is empty.
  function fieldBlock(label, raw, missing) {
    var v = (raw || '').replace(/\s+$/, '');
    if (!v.trim()) return ['- ' + label + ': ‹ ' + missing + ' ›'];
    var lines = v.split('\n').map(function (s) { return s.replace(/\s+$/, ''); });
    if (lines.length === 1) return ['- ' + label + ': ' + lines[0]];
    return ['- ' + label + ':'].concat(lines.map(function (l) { return '    ' + l; }));
  }

  function buildPrompt(v) {
    var out = [
      'I want you to add a new black-box system test to this repo’s chat-systest suite.',
      '',
      'First read `' + CONVENTION + '` and `' + PLAN + '` and follow that convention',
      'exactly: drive the running Harness over the real HTTP/SSE surface, reuse the shared',
      'helpers in `tests/chat-systest/lib.mjs` (login, raw/api, startTurn, readSse, check,',
      'report), record every assertion with check() so the run collects all results, and run',
      'it against an ISOLATED instance (fresh CLAUDEWEB_DATADIR, own port, throwaway scratch',
      'repo) — never the live :5099 store.',
      '',
      'The behaviour to test:',
    ];
    out = out.concat(fieldBlock('WHAT', v.what, FIELDS[0].missing));
    out = out.concat(fieldBlock('REPRODUCE', v.repro, FIELDS[1].missing));
    out = out.concat(fieldBlock('EXPECTED', v.expected, FIELDS[2].missing));
    if (v.isBug) out = out.concat(fieldBlock('ACTUAL', v.actual, FIELDS[3].missing));
    out.push('');
    out.push('Put it in the suite that matches its token cost (behavioural.mjs = no tokens;');
    out.push('smoke/realrun/badinput = real CLI), register the scenario in');
    out.push('tests/chat-systest/hub/suites.json so the control hub shows it, then run it against');
    out.push('an isolated instance and show me PASS/FAIL.');
    if (v.isBug) {
      out.push('This is a known bug — record a one-line repro in the findings, but do NOT fix the');
      out.push('product here; fixes spin out to their own branch (one feature per branch).');
    } else {
      out.push('If you find it is actually broken, record a one-line repro in the findings — but do');
      out.push('NOT fix the product here; fixes spin out to their own branch (one feature per branch).');
    }
    return out.join('\n');
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function toHtml(plain) {
    return escapeHtml(plain).replace(MISSING_RE, function (m) {
      return '<span class="systf-missing">' + m + '</span>';
    });
  }

  function mount(root) {
    root.classList.add('topic--systest');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'Fill the form and a paste-ready prompt is <b>generated below as you type</b> — no ' +
      '<code>&lt;…&gt;</code> placeholders to remember to swap. Paste the result into any agent ' +
      'working in this repo and it understands you want a <em>new black-box system test</em> in ' +
      'the chat-systest suite, plus <em>exactly which</em> behaviour and <em>how to reproduce</em> ' +
      'it. The prompt points the agent at the on-disk convention for the <b>how</b>; you only ' +
      'supply the <b>what</b>.';
    root.appendChild(lead);

    // ----- the form -----
    var state = { what: '', repro: '', expected: '', actual: '', isBug: false };
    var inputs = {};
    var fieldWraps = {};

    var form = H.el('form', 'systf');
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    FIELDS.forEach(function (f) {
      var wrap = H.el('div', 'systf-field' + (f.onlyIfBug ? ' systf-actual' : ''));
      if (f.onlyIfBug) wrap.hidden = true;
      fieldWraps[f.key] = wrap;

      var label = H.el('label', 'systf-label');
      label.setAttribute('for', 'systf-' + f.key);
      label.appendChild(document.createTextNode(f.label + ' '));
      label.appendChild(H.el('span', f.required ? 'systf-req' : 'systf-opt',
        f.required ? 'required' : 'optional'));
      wrap.appendChild(label);

      var hint = H.el('p', 'systf-hint', f.hint);
      wrap.appendChild(hint);

      var input = f.multiline ? H.el('textarea', 'systf-textarea') : H.el('input', 'systf-input');
      input.id = 'systf-' + f.key;
      input.setAttribute('placeholder', f.placeholder);
      if (f.multiline) input.rows = f.key === 'repro' ? 4 : 2;
      else input.type = 'text';
      input.addEventListener('input', function () { state[f.key] = input.value; render(); });
      inputs[f.key] = input;
      wrap.appendChild(input);

      form.appendChild(wrap);
    });

    // bug toggle — reveals the ACTUAL field
    var bugWrap = H.el('label', 'systf-bug');
    var bugBox = document.createElement('input');
    bugBox.type = 'checkbox';
    bugBox.id = 'systf-isbug';
    bugWrap.appendChild(bugBox);
    bugWrap.appendChild(document.createTextNode(
      'This is a bug I can already reproduce (adds an ACTUAL field; tells the agent to record a finding)'));
    bugBox.addEventListener('change', function () {
      state.isBug = bugBox.checked;
      fieldWraps.actual.hidden = !bugBox.checked;
      render();
    });
    form.appendChild(bugWrap);

    root.appendChild(form);

    // ----- the generated prompt -----
    var promptWrap = H.el('div', 'ut-prompt');
    var pHead = H.el('div', 'ut-prompt__head');
    var pTitle = H.el('div', 'ut-prompt__title', 'Generated prompt');
    var copyBtn = H.el('button', 'ut-prompt__copy', 'Copy');
    copyBtn.type = 'button';
    pHead.appendChild(pTitle);
    pHead.appendChild(copyBtn);
    var pBody = H.el('pre', 'ut-code ut-prompt__body');
    var pCode = H.el('code');
    pBody.appendChild(pCode);
    promptWrap.appendChild(pHead);
    promptWrap.appendChild(pBody);
    root.appendChild(promptWrap);

    // ----- live render + copy gating -----
    var plain = '';
    var ready = false;
    function render() {
      plain = buildPrompt(state);
      pCode.innerHTML = toHtml(plain);
      ready = !MISSING_RE.test(plain);
      MISSING_RE.lastIndex = 0; // reset the stateful /g regex after .test()
      FIELDS.forEach(function (f) {
        if (!f.required && !(f.onlyIfBug && state.isBug)) { fieldWraps[f.key].classList.remove('is-missing'); return; }
        var empty = !(state[f.key] || '').trim();
        fieldWraps[f.key].classList.toggle('is-missing', empty);
      });
      copyBtn.disabled = !ready;
      if (!ready) { copyBtn.textContent = 'Fill required fields'; copyBtn.classList.remove('is-ok', 'is-err'); }
      else if (copyBtn.textContent === 'Fill required fields') copyBtn.textContent = 'Copy';
    }

    var copyReset = null;
    copyBtn.addEventListener('click', function () {
      if (!ready) return;
      function flash(label, ok) {
        copyBtn.textContent = label;
        copyBtn.classList.toggle('is-ok', !!ok);
        copyBtn.classList.toggle('is-err', !ok);
        if (copyReset) clearTimeout(copyReset);
        copyReset = setTimeout(function () {
          copyBtn.textContent = ready ? 'Copy' : 'Fill required fields';
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
        navigator.clipboard.writeText(plain).then(function () { flash('Copied ✓', true); }, fallback);
      } else {
        fallback();
      }
    });

    var why = H.el('div', 'ut-note');
    why.innerHTML =
      '<b>Why a form instead of a fill-in template:</b> the prompt is assembled from your ' +
      'answers, so there’s no <code>&lt;…&gt;</code> left to forget. Copy stays disabled and any ' +
      'still-empty required field is <span class="systf-missing">highlighted</span> in the ' +
      'preview until it’s answered. And it stays a <em>pointer</em> to <code>' + CONVENTION +
      '</code> — one source of truth, no pasted copy to drift.';
    root.appendChild(why);

    // ----- animated strip: what the agent does next -----
    root.appendChild(H.el('h3', 'ut-h', 'What the agent does after you paste'));
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

    var note = H.el('div', 'ut-note');
    note.innerHTML =
      '<b>Tip:</b> the sharper your <code>REPRODUCE</code> steps, the closer the test writes ' +
      'itself — they map almost line-for-line onto <code>lib.mjs</code> calls. A vague ask ' +
      '(“test that stop works”) makes the agent guess; concrete steps + an EXPECTED give it ' +
      'a precise assertion to pin.';
    root.appendChild(note);

    render(); // initial paint — shows the scaffold with highlighted required gaps

    return { destroy: function () { if (timer) clearInterval(timer); } };
  }

  H.register({
    id: 'systest-request',
    label: '🧪 Ask an agent to add a system test',
    tabDesc: 'request a new test',
    mount: mount,
  });
})();
