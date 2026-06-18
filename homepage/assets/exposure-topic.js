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

  function mount(root) {
    // ---- build the topic's own DOM (no shared ids; everything is local) ----
    root.classList.add('topic--exposure');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'A real product running on <code>:5305</code> — and the live, animated explainer ' +
      'for getting <em>any</em> app onto the Local tab. Pick a visualization style:';

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
