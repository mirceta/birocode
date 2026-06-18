// Topic 1 — "Local exposure, done right".
//
// This is the original standalone explainer, now wrapped as one homepage topic.
// It builds its own sub-UI inside the topic container — a lead line, the variant
// switcher (the four viz styles nested HERE, under this topic), the stage the
// active variant mounts into, and the Play/Pause/Reset controls — then drives
// whichever ExposureViz variant is selected. (This is the old app.js shell, made
// container-scoped so it can live beside other topics.)

(function () {
  var H = window.ClaudeWebHome;
  var EV = window.ExposureViz;

  // ---- the prompt the operator pastes into the OTHER agent's chat ----
  // A POINTER, not a copy — same move as the Understanding topic. The other agent runs
  // on THIS box, so it reads the canonical exposure contract straight off disk; nothing
  // to drift. But unlike the Understanding paste (an ongoing "every time you explain…"
  // habit), this is a ONE-SHOT setup task: reconfigure THIS running product so the Local
  // tab can reach it. One source of truth: docs/local-exposure-convention.md.
  var CONVENTION_DOC =
    'C:\\Users\\Administrator\\Desktop\\playground\\birocode\\docs\\local-exposure-convention.md';

  // A repo can run SEVERAL web apps; the operator names the one to expose and we
  // inject it into the prompt. Empty input → a grammatical generic fallback so the
  // block still reads before anything is typed.
  function buildPrompt(service) {
    var s = (service || '').trim();
    var target = s ? s : 'the web app you want to expose';
    return 'This repository may run several web apps — I want to expose ' + target + ' on the ' +
      'Claude Web Local tab. Read the file `' + CONVENTION_DOC + '` and reconfigure ' + target +
      ' so it satisfies the three-rule contract in that doc: (1) dual-stack bind — listen on ' +
      '127.0.0.1 AND [::1]; (2) serve its page at GET /; (3) reference every asset with a ' +
      'relative URL (./… not /…). Then tell me the port ' + target + ' listens on so I can ' +
      'register it as a Local app for this repo. The doc is the single source of truth — ' +
      're-read it if the convention ever changes.';
  }

  function mount(root) {
    // ---- build the topic's own DOM (no shared ids; everything is local) ----
    root.classList.add('topic--exposure');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'A real product running on <code>:5305</code> — and the live, animated explainer ' +
      'for getting <em>any</em> app onto the Local tab. Want another on-box agent to expose ' +
      'its own product? Paste the prompt below into its chat. Then pick a visualization ' +
      'style to see the contract in motion:';

    var tabsEl = H.el('nav', 'variants');
    tabsEl.setAttribute('aria-label', 'Visualization style');

    var stage = H.el('main', 'stage');

    var controls = H.el('section', 'controls');
    var btnPlay = H.el('button', 'btn btn--primary', '▶ Play');
    var btnPause = H.el('button', 'btn', '❚❚ Pause');
    btnPause.disabled = true;
    var btnReset = H.el('button', 'btn', '↺ Reset');
    var blurbEl = H.el('span', 'controls__hint');
    controls.appendChild(btnPlay);
    controls.appendChild(btnPause);
    controls.appendChild(btnReset);
    controls.appendChild(blurbEl);

    root.appendChild(lead);

    // ----- paste-this-into-the-other-agent prompt (task-framed, a pointer) -----
    var promptWrap = H.el('div', 'ut-prompt');
    var pHead = H.el('div', 'ut-prompt__head');
    var pTitle = H.el('div', 'ut-prompt__title');
    pTitle.innerHTML = '🚀 Paste this into the other agent’s chat';
    var copyBtn = H.el('button', 'ut-prompt__copy', 'Copy');
    copyBtn.type = 'button';
    pHead.appendChild(pTitle);
    pHead.appendChild(copyBtn);

    // Which of the repo's (possibly several) web apps to expose — injected live
    // into the prompt below as the operator types.
    var field = H.el('div', 'ut-prompt__field');
    var fieldLabel = H.el('label', 'ut-prompt__label', 'Which service should it expose?');
    var serviceInput = H.el('input', 'ut-prompt__input');
    serviceInput.type = 'text';
    serviceInput.placeholder = 'e.g. the API on :4000, the Vite dev server, the docs site';
    var inputId = 'expose-service';
    serviceInput.id = inputId;
    fieldLabel.setAttribute('for', inputId);
    field.appendChild(fieldLabel);
    field.appendChild(serviceInput);

    var pBody = H.el('pre', 'ut-code ut-prompt__body');
    var pCode = H.el('code', null, buildPrompt(''));
    pBody.appendChild(pCode);
    promptWrap.appendChild(pHead);
    promptWrap.appendChild(field);
    promptWrap.appendChild(pBody);
    root.appendChild(promptWrap);

    // Keep the visible prompt in sync with the chosen service.
    function currentPrompt() { return buildPrompt(serviceInput.value); }
    serviceInput.addEventListener('input', function () {
      pCode.textContent = currentPrompt();
    });

    var why = H.el('div', 'ut-note');
    why.innerHTML =
      '<b>Name the service first:</b> a repo can run several web apps — type which one to ' +
      'expose above and it’s injected into the prompt before you copy it. <b>Why it’s a ' +
      'pointer, not the whole contract:</b> the other agent is on the <b>same box</b>, so it ' +
      'reads the canonical doc off disk — change the convention there and every agent picks it ' +
      'up, with no pasted copy to drift. <b>And why it’s a one-shot task, not a habit:</b> ' +
      'unlike the Understanding app (which the harness serves for you), this is a real product ' +
      '<em>you</em> run — the paste tells the agent to make it conform and hand you the port; ' +
      'registering that port stays your deliberate step. The contract it follows is the same ' +
      'three rules animated below.';
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
        navigator.clipboard.writeText(currentPrompt()).then(
          function () { flash('Copied ✓', true); },
          fallback
        );
      } else {
        fallback();
      }
    });

    root.appendChild(tabsEl);
    root.appendChild(stage);
    root.appendChild(controls);

    // ---- variant switching (ported from the standalone shell) ----
    var active = null;     // current variant controller

    function setButtons(state) {
      var playing = state === 'playing';
      btnPlay.disabled = playing;
      btnPause.disabled = !playing;
      btnPlay.textContent = state === 'done' ? '▶ Replay' : '▶ Play';
    }

    function mountVariant(variant) {
      if (active && active.destroy) active.destroy();
      stage.innerHTML = '';
      blurbEl.textContent = variant.blurb || '';
      var ctx = {
        nodes: EV.NODES,
        messages: EV.MESSAGES,
        rules: EV.RULES,
        el: EV.el,
        onState: setButtons,
      };
      active = variant.mount(stage, ctx) || {};
      setButtons('paused');
      Array.prototype.forEach.call(tabsEl.children, function (b) {
        b.classList.toggle('is-active', b.dataset.id === variant.id);
      });
    }

    EV.variants.forEach(function (variant) {
      var b = H.el('button', 'variants__tab');
      b.dataset.id = variant.id;
      b.innerHTML =
        '<span class="variants__label">' + variant.label + '</span>' +
        '<span class="variants__desc">' + (variant.tabDesc || '') + '</span>';
      b.addEventListener('click', function () { mountVariant(variant); });
      tabsEl.appendChild(b);
    });

    btnPlay.addEventListener('click', function () { if (active && active.play) active.play(); });
    btnPause.addEventListener('click', function () { if (active && active.pause) active.pause(); });
    btnReset.addEventListener('click', function () { if (active && active.reset) active.reset(); });

    if (!EV.variants.length) {
      stage.textContent = 'No visualization variants loaded.';
    } else {
      mountVariant(EV.variants[0]);
    }

    // When the user switches topics, tear down the running variant's RAF/timers.
    return {
      destroy: function () { if (active && active.destroy) active.destroy(); },
    };
  }

  H.register({
    id: 'exposure',
    label: '🛰️ Local exposure, done right',
    tabDesc: 'reach the Local tab',
    mount: mount,
  });
})();
