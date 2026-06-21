// Topic — "Global exposure, done right".
//
// The PUBLIC twin of the Local-exposure topic (exposure-topic.js): same sub-UI
// shape (lead · paste-into-the-other-agent pointer prompt · why-note · the four
// shared viz variants · Play/Pause/Reset), but it drives the GLOBAL story —
// GlobalExposureViz data fed to the SAME ExposureViz.variants via ctx. The viz
// variants read their data from ctx, so no renderer is duplicated.

(function () {
  var H = window.ClaudeWebHome;
  var EV = window.ExposureViz;          // shared variant registry + el() helper
  var G = window.GlobalExposureViz;     // the public-path data set

  // ---- the prompt the operator pastes into the OTHER agent's chat ----
  // A POINTER, not a copy (same move as the Local topic). The other agent is on
  // THIS box, so it reads the canonical contract straight off disk — nothing to
  // drift. Repo-relative on purpose: the Local topic hardcodes an absolute path
  // with a stale username; a repo-relative reference works on any checkout.
  var CONVENTION_DOC = 'docs/global-exposure-convention.md';

  function buildPrompt(service) {
    var s = (service || '').trim();
    var target = s ? s : 'the web app you want to expose';
    return 'This repository may run several web apps — I want to expose ' + target +
      ' GLOBALLY: on the public Claude Web Homepage (no login), reachable through the ' +
      'off-box IIS/ARR HTTPS door at /preview/ → :5200. Read the file `' + CONVENTION_DOC +
      '` in the Claude Web repo and reconfigure ' + target + ' so it satisfies the ' +
      'five-rule contract there: (1) bind 0.0.0.0:5200 — all interfaces, launched detached, ' +
      'port freed first; (2) serve its page at GET /; (3) carry the /preview/ base on every ' +
      'asset AND runtime fetch URL (./… not /…); (4) send a body (even {}) on every POST so ' +
      'IIS+ARR does not 411; (5) cache-bust GETs (?_=Date.now()) so ARR’s output cache ' +
      'does not serve stale state. Then start it on :5200 and tell me, so I can verify the ' +
      'public hop. The doc is the single source of truth — re-read it if the convention changes.';
  }

  function mount(root) {
    root.classList.add('topic--exposure', 'topic--global');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'The <b>public twin</b> of the Local topic: how to get a product onto the ' +
      '<b>public Homepage</b> — <em>no login</em>, the one surface a stranger can reach — ' +
      'through the off-box <code>IIS/ARR</code> door that forwards <code>/preview/</code> to ' +
      'your product on <code>:5200</code>. It crosses a real public proxy, so it carries ' +
      '<b>five</b> rules, not three. Paste the prompt below to have another on-box agent make ' +
      'its product conform, then pick a visualization style:';

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
    pTitle.innerHTML = '🌐 Paste this into the other agent’s chat';
    var copyBtn = H.el('button', 'ut-prompt__copy', 'Copy');
    copyBtn.type = 'button';
    pHead.appendChild(pTitle);
    pHead.appendChild(copyBtn);

    var field = H.el('div', 'ut-prompt__field');
    var fieldLabel = H.el('label', 'ut-prompt__label', 'Which service should it expose?');
    var serviceInput = H.el('input', 'ut-prompt__input');
    serviceInput.type = 'text';
    serviceInput.placeholder = 'e.g. the App product, the Vite build, the docs site';
    var inputId = 'global-expose-service';
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

    function currentPrompt() { return buildPrompt(serviceInput.value); }
    serviceInput.addEventListener('input', function () {
      pCode.textContent = currentPrompt();
    });

    var why = H.el('div', 'ut-note');
    why.innerHTML =
      '<b>Global vs Local:</b> the Local tab proxies your product over <em>loopback, behind ' +
      'login</em> — three rules. Global puts it on the <em>public</em> Homepage through an ' +
      '<b>off-box IIS+ARR</b> proxy, which adds two traps loopback never had: a body-less ' +
      'POST gets a <code>411</code>, and ARR’s GET <b>output cache</b> serves stale state even ' +
      'when the backend says <code>no-store</code>. <b>Why a pointer, not the whole contract:</b> ' +
      'the other agent is on the <b>same box</b>, so it reads ' +
      '<code>docs/global-exposure-convention.md</code> off disk — change the convention there ' +
      'and every agent picks it up. The five rules are animated below.';
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

    // ---- variant switching: reuse EV.variants, feed them the GLOBAL ctx ----
    var active = null;

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
        nodes: G.NODES,
        messages: G.MESSAGES,
        rules: G.RULES,
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

    return {
      destroy: function () { if (active && active.destroy) active.destroy(); },
    };
  }

  H.register({
    id: 'global',
    label: '🌐 Global exposure, done right',
    tabDesc: 'reach the public homepage',
    mount: mount,
  });
})();
