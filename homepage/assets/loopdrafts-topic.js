// Topic — "Fill the loop" (openspec: add-loop-drafts).
//
// The harness keeps one loop DRAFT per (registered repo, draft type): scratch
// text the operator and any pasted agent build up BEFORE it becomes real loop
// parameters. This topic generates the paste-ready prompt that sends an agent
// to edit one such draft over the harness HTTP API. Same recipe as the systest
// topic: a small FORM, the prompt generated live (no `<…>` placeholders to
// forget), copy disabled until the required fields are filled — and the prompt
// is a POINTER to the on-disk convention doc (the single source of truth for
// the contract), never a pasted copy of it.
//
// Build-less and self-contained — reuses the shared ut-* and systf-* styles.

(function () {
  var H = window.ClaudeWebHome;

  // The canonical contract, absolute because the pasted agent may live in ANY
  // repo on this box (understanding-topic precedent).
  var CONVENTION_DOC =
    'C:\\Users\\km\\Desktop\\playground\\birocode\\docs\\loop-drafts-convention.md';

  var MISSING_RE = /‹[^›]*›/g;

  // ---- the three draft types and what each expects -----------------------------
  var TYPES = [
    {
      key: 'queue-plan', label: '🗒️ Queue plan',
      shape: 'Shape the result as a SEQUENCE of self-contained prompts destined for the ' +
        'queued-prompts loop: one prompt per block, blocks separated by a line containing ' +
        'only ---. Each block must stand alone — it will be sent with no other context.',
    },
    {
      key: 'goal', label: '🎯 Goal',
      shape: 'Shape the result as ONE coherent goal definition for a goal-based loop: the ' +
        'end state to reach and how to tell it is reached. One goal, not a list.',
    },
    {
      key: 'freestyle', label: '✍️ Freestyle',
      shape: 'Free text is fine — capture and organise the ideas; no required shape yet.',
    },
  ];

  // ---- the form fields ---------------------------------------------------------
  var FIELDS = [
    {
      key: 'base', label: 'BASE URL — where the harness listens', required: true,
      multiline: false, preset: 'http://localhost:5099',
      hint: 'The harness the draft lives in. localhost:5099 is the live instance on this box.',
      placeholder: 'http://localhost:5099',
      missing: 'give the harness base URL above',
    },
    {
      key: 'code', label: 'ACCESS CODE — the harness session password', required: true,
      multiline: false,
      hint: 'The agent logs in with it once (POST /api/auth/login) to get a session cookie. ' +
        'Same code the web UI asks for.',
      placeholder: 'the code the web login asks for',
      missing: 'fill in the access code above',
    },
    {
      key: 'repo', label: 'REPO ID — whose draft to edit', required: true, multiline: false,
      hint: 'The registered repo the draft belongs to. GET ' +
        '<base>/api/repos lists ids, or read them off the harness Projects tab.',
      placeholder: 'e.g. birocode',
      missing: 'name the repo id above',
    },
    {
      key: 'tasks', label: 'TASKS — what the draft should cover', required: true, multiline: true,
      hint: 'The substance: the tasks, ideas, or goal you want drafted. The agent integrates ' +
        'this with whatever the draft already holds — it never overwrites blind.',
      placeholder: '- migrate the settings store\n- add an export button to the Files tab\n- …',
      missing: 'say what the draft should cover above',
    },
  ];

  // ---- what the agent does after you paste (animated strip) --------------------
  var STEPS = [
    {
      glyph: '📖',
      title: 'Reads the convention',
      sub: 'docs/loop-drafts-convention.md',
      cap: 'The agent opens the on-disk contract first: the three draft types and their ' +
        'content shapes, the exact HTTP calls, and the read-integrate-rewrite etiquette.',
    },
    {
      glyph: '🔑',
      title: 'Logs in, reads the draft',
      sub: 'POST /api/auth/login · GET /api/autopilot/drafts/…',
      cap: 'One login for a session cookie, then it GETs the current draft text — you or ' +
        'another agent may have written there already, and last write wins, so reading ' +
        'first is mandatory.',
    },
    {
      glyph: '✍️',
      title: 'Integrates and PUTs back',
      sub: 'whole draft, shaped per type',
      cap: 'It merges your TASKS into the existing text, shapes the result the way the ' +
        'chosen type demands (---‑separated prompts · one goal · free text), and PUTs the ' +
        'complete draft back.',
    },
    {
      glyph: '📝',
      title: 'You see it in Drafts',
      sub: 'Autopilot console → 📝 Drafts → repo → type',
      cap: 'Reload the draft in the harness and shape it onward when ready — into queued ' +
        'prompts or a goal loop. The draft is scratch space; nothing runs until you make ' +
        'it a real loop.',
    },
  ];

  // ---- prompt generation -------------------------------------------------------
  function fieldBlock(label, raw, missing) {
    var v = (raw || '').replace(/\s+$/, '');
    if (!v.trim()) return ['- ' + label + ': ‹ ' + missing + ' ›'];
    var lines = v.split('\n').map(function (s) { return s.replace(/\s+$/, ''); });
    if (lines.length === 1) return ['- ' + label + ': ' + lines[0]];
    return ['- ' + label + ':'].concat(lines.map(function (l) { return '    ' + l; }));
  }

  function typeDef(key) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i];
    return TYPES[0];
  }

  function buildPrompt(v) {
    var t = typeDef(v.type);
    var out = [
      'I want you to fill a loop draft in the Claude Web harness on this box.',
      '',
      'First read `' + CONVENTION_DOC + '` — it is the single source of truth for the',
      'loop-drafts contract (the three draft types, the exact HTTP calls, and the',
      'read-integrate-rewrite etiquette). Follow it exactly.',
      '',
      'The draft to edit:',
    ];
    out = out.concat(fieldBlock('BASE URL', v.base, FIELDS[0].missing));
    out = out.concat(fieldBlock('ACCESS CODE', v.code, FIELDS[1].missing));
    out = out.concat(fieldBlock('REPO ID', v.repo, FIELDS[2].missing));
    out.push('- DRAFT TYPE: ' + t.key);
    out.push('');
    out.push('What the draft should cover:');
    out = out.concat(fieldBlock('TASKS', v.tasks, FIELDS[3].missing));
    out.push('');
    out.push('Per the convention: log in, GET the current draft FIRST, integrate what is');
    out.push('already there with the tasks above (keep existing content unless I explicitly');
    out.push('said to replace it), then PUT the complete draft back. ' + t.shape);
    out.push('');
    out.push('Afterwards, summarise in a few lines what the draft now contains.');
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
    root.classList.add('topic--loopdrafts');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'Every registered repo has one loop <b>draft</b> per type — 🗒️ <em>queue plan</em>, ' +
      '🎯 <em>goal</em>, ✍️ <em>freestyle</em> — living in the harness (Autopilot console → ' +
      '<b>📝 Drafts</b>) and editable by anyone over its HTTP API. Fill the form and paste ' +
      'the generated prompt into <b>any agent on this box</b>: it will read the current ' +
      'draft, weave your tasks in, and save it back — the drafting half of running a loop, ' +
      'done for you. The prompt points the agent at the on-disk convention doc for the ' +
      '<b>how</b>; you only supply the <b>what</b>.';
    root.appendChild(lead);

    // ----- the form -----
    var state = { base: FIELDS[0].preset, code: '', repo: '', tasks: '', type: 'queue-plan' };
    var fieldWraps = {};

    var form = H.el('form', 'systf');
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    FIELDS.forEach(function (f) {
      var wrap = H.el('div', 'systf-field');
      fieldWraps[f.key] = wrap;

      var label = H.el('label', 'systf-label');
      label.setAttribute('for', 'ld-' + f.key);
      label.appendChild(document.createTextNode(f.label + ' '));
      label.appendChild(H.el('span', 'systf-req', 'required'));
      wrap.appendChild(label);

      wrap.appendChild(H.el('p', 'systf-hint', f.hint));

      var input = f.multiline ? H.el('textarea', 'systf-textarea') : H.el('input', 'systf-input');
      input.id = 'ld-' + f.key;
      input.setAttribute('placeholder', f.placeholder);
      if (f.multiline) input.rows = 4;
      else input.type = 'text';
      if (f.preset) input.value = f.preset;
      input.addEventListener('input', function () { state[f.key] = input.value; render(); });
      wrap.appendChild(input);

      form.appendChild(wrap);
    });

    // draft-type picker — a pill row, mirroring the tab the draft lands in
    var typeWrap = H.el('div', 'systf-field');
    var typeLabel = H.el('label', 'systf-label', 'DRAFT TYPE — which of the three drafts to edit');
    typeWrap.appendChild(typeLabel);
    typeWrap.appendChild(H.el('p', 'systf-hint',
      'Queue plan = a ---‑separated sequence of self-contained prompts · Goal = one goal ' +
      'definition · Freestyle = raw text to shape later.'));
    var typeRow = H.el('div', 'ldf-types');
    var typeBtns = TYPES.map(function (t) {
      var b = H.el('button', 'ldf-type' + (state.type === t.key ? ' on' : ''), t.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.type = t.key;
        typeBtns.forEach(function (x, i) { x.classList.toggle('on', TYPES[i].key === t.key); });
        render();
      });
      typeRow.appendChild(b);
      return b;
    });
    typeWrap.appendChild(typeRow);
    form.appendChild(typeWrap);

    root.appendChild(form);

    // ----- the generated prompt -----
    var promptWrap = H.el('div', 'ut-prompt');
    var pHead = H.el('div', 'ut-prompt__head');
    pHead.appendChild(H.el('div', 'ut-prompt__title', 'Generated prompt'));
    var copyBtn = H.el('button', 'ut-prompt__copy', 'Copy');
    copyBtn.type = 'button';
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
        fieldWraps[f.key].classList.toggle('is-missing', !(state[f.key] || '').trim());
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
      '<b>Why the agent GETs before it PUTs:</b> one draft per repo and type, and a save ' +
      'replaces the whole text — last write wins. So the contract makes every writer read ' +
      'the current draft first and integrate, which is what lets <em>several</em> agents ' +
      '(and you, in the Drafts tab) build the same task list up instead of clobbering it.';
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

    render(); // initial paint — shows the scaffold with highlighted required gaps

    return { destroy: function () { if (timer) clearInterval(timer); } };
  }

  H.register({
    id: 'loop-drafts',
    label: '📝 Fill the loop',
    tabDesc: 'draft loop tasks via any agent',
    mount: mount,
  });
})();
