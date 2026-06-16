// App shell: builds the variant switcher, mounts the selected visualization, and
// wires the global Play / Pause / Reset controls to whichever variant is active.
//
// Each variant (registered in window.ExposureViz.variants) exposes:
//   mount(container, ctx) -> { play(), pause(), reset(), destroy() }
// ctx = { nodes, messages, rules, onState(fn) }  where onState reports
// 'playing' | 'paused' | 'done' so the shell can toggle buttons.

(function () {
  var EV = window.ExposureViz;
  var stage = document.getElementById('stage');
  var tabsEl = document.getElementById('variant-tabs');
  var blurbEl = document.getElementById('variant-blurb');
  var btnPlay = document.getElementById('btn-play');
  var btnPause = document.getElementById('btn-pause');
  var btnReset = document.getElementById('btn-reset');

  var active = null;     // current controller
  var activeId = null;

  function setButtons(state) {
    var playing = state === 'playing';
    btnPlay.disabled = playing;
    btnPause.disabled = !playing;
    btnPlay.textContent = state === 'done' ? '▶ Replay' : '▶ Play';
  }

  function mountVariant(variant) {
    if (active && active.destroy) active.destroy();
    stage.innerHTML = '';
    activeId = variant.id;
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
    // Update which tab looks selected.
    Array.prototype.forEach.call(tabsEl.children, function (b) {
      b.classList.toggle('is-active', b.dataset.id === variant.id);
    });
  }

  function buildTabs() {
    EV.variants.forEach(function (variant) {
      var b = EV.el('button', 'variants__tab');
      b.dataset.id = variant.id;
      b.innerHTML = '<span class="variants__label">' + variant.label + '</span>' +
        '<span class="variants__desc">' + (variant.tabDesc || '') + '</span>';
      b.addEventListener('click', function () { mountVariant(variant); });
      tabsEl.appendChild(b);
    });
  }

  btnPlay.addEventListener('click', function () { if (active && active.play) active.play(); });
  btnPause.addEventListener('click', function () { if (active && active.pause) active.pause(); });
  btnReset.addEventListener('click', function () { if (active && active.reset) active.reset(); });

  if (!EV.variants.length) {
    stage.textContent = 'No visualization variants loaded.';
    return;
  }
  buildTabs();
  mountVariant(EV.variants[0]);
})();
