// Variant D — Step-through. A user-driven, click-by-click reader of the round
// trip. Three node cards in a row with the active hop's from/to nodes lit and a
// colored direction arrow between them; a clickable numbered timeline; Prev/Next
// buttons; and a prominent explanation panel (label + full detail + the contract
// rule callout). Play auto-advances on a timer; this variant is about reading at
// your own pace, so the per-step copy is the hero.
//
// Matches the reference controller shape: mount(container, ctx) returns
// { play, pause, reset, destroy }.

(function () {
  var EV = window.ExposureViz;

  // ---- inject scoped styles (no edits to styles.css; classes prefixed .sp-) ----
  var STYLE_ID = 'sp-stepper-styles';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.sp-wrap { display: flex; flex-direction: column; gap: 18px; }',
      // node row with the directional indicator overlaid
      '.sp-stage { position: relative; }',
      '.sp-row { display: flex; align-items: stretch; gap: 18px; }',
      '.sp-node { flex: 1; max-width: 240px; opacity: .55; transition: opacity .25s; }',
      '.sp-node.is-hot { opacity: 1; }',
      // arrow indicator between the two active nodes
      '.sp-arrow {',
      '  display: flex; align-items: center; justify-content: center;',
      '  min-width: 54px; font-size: 26px; font-weight: 700; line-height: 1;',
      '  opacity: 0; transform: scale(.7); transition: opacity .2s, transform .2s;',
      '}',
      '.sp-arrow.is-on { opacity: 1; transform: scale(1); }',
      '.sp-arrow.is-req { color: var(--req); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--req) 70%, transparent)); }',
      '.sp-arrow.is-res { color: var(--res); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--res) 70%, transparent)); }',
      // timeline of numbered pips
      '.sp-timeline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.sp-pip {',
      '  width: 30px; height: 30px; border-radius: 50%;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  font: inherit; font-weight: 650; font-size: 12.5px; cursor: pointer;',
      '  color: var(--ink-dim); background: var(--panel-2);',
      '  border: 1px solid var(--edge); transition: border-color .15s, background .15s, color .15s, transform .1s;',
      '}',
      '.sp-pip:hover { border-color: var(--accent); color: var(--ink); }',
      '.sp-pip:active { transform: translateY(1px); }',
      '.sp-pip.is-past { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 45%, var(--edge)); }',
      '.sp-pip.is-current {',
      '  color: var(--ink); background: color-mix(in srgb, var(--accent) 22%, var(--panel-2));',
      '  border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent);',
      '}',
      '.sp-pip.is-current.is-req { box-shadow: 0 0 0 1px var(--req); border-color: var(--req); }',
      '.sp-pip.is-current.is-res { box-shadow: 0 0 0 1px var(--res); border-color: var(--res); }',
      // explanation panel — the hero
      '.sp-panel {',
      '  background: var(--panel-2); border: 1px solid var(--edge);',
      '  border-radius: var(--radius); padding: 18px 20px;',
      '  display: flex; flex-direction: column; gap: 10px;',
      '}',
      '.sp-panel.sp-flash { animation: sp-flash .5s ease; }',
      '@keyframes sp-flash { from { border-color: var(--accent); } to { border-color: var(--edge); } }',
      '.sp-panel__top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.sp-panel__count { font-size: 12px; color: var(--ink-dim); font-weight: 600; }',
      '.sp-panel__label { font-family: var(--mono); font-size: 15px; font-weight: 600; }',
      '.sp-panel__label .req { color: var(--req); }',
      '.sp-panel__label .res { color: var(--res); }',
      '.sp-panel__detail { color: var(--ink); font-size: 14px; max-width: 78ch; line-height: 1.6; }',
      // rule callout box
      '.sp-rule {',
      '  display: flex; flex-direction: column; gap: 4px;',
      '  border-radius: var(--radius-sm); padding: 10px 14px;',
      '  border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);',
      '  background: color-mix(in srgb, var(--warn) 10%, transparent);',
      '}',
      '.sp-rule__text { color: var(--ink); font-size: 13px; }',
      // controls (Prev/Next live inside the variant)
      '.sp-nav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.sp-nav .sp-spacer { flex: 1; }',
      '.sp-nav__hint { color: var(--ink-dim); font-size: 12.5px; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function mount(container, ctx) {
    var nodes = ctx.nodes, messages = ctx.messages, rules = ctx.rules || [];
    var N = messages.length;

    // rule id -> rule object, for the callout text.
    var ruleById = {};
    rules.forEach(function (r) { ruleById[r.id] = r; });

    var wrap = EV.el('div', 'sp-wrap');

    // ---- node row with arrow indicators interleaved ----
    var stage = EV.el('div', 'sp-stage');
    var row = EV.el('div', 'sp-row');
    var cards = {};          // node id -> card element
    var arrows = [];         // arrow element between node[k] and node[k+1]

    nodes.forEach(function (n, idx) {
      var card = EV.el('div', 'node sp-node');
      card.innerHTML =
        '<div class="node__glyph">' + n.glyph + '</div>' +
        '<div class="node__title">' + n.title + '</div>' +
        '<div class="node__sub">' + n.sub + '</div>';
      cards[n.id] = card;
      row.appendChild(card);
      if (idx < nodes.length - 1) {
        var arrow = EV.el('div', 'sp-arrow');
        row.appendChild(arrow);
        arrows.push(arrow);
      }
    });
    stage.appendChild(row);
    wrap.appendChild(stage);

    // ---- numbered timeline ----
    var timeline = EV.el('div', 'sp-timeline');
    var pips = [];
    messages.forEach(function (m, idx) {
      var pip = EV.el('button', 'sp-pip', String(idx + 1));
      pip.type = 'button';
      pip.setAttribute('aria-label', 'Go to step ' + (idx + 1));
      pip.addEventListener('click', function () { go(idx, false); });
      timeline.appendChild(pip);
      pips.push(pip);
    });
    wrap.appendChild(timeline);

    // ---- explanation panel (hero) ----
    var panel = EV.el('div', 'sp-panel');
    var top = EV.el('div', 'sp-panel__top');
    var count = EV.el('div', 'sp-panel__count');
    var label = EV.el('div', 'sp-panel__label');
    top.appendChild(count);
    top.appendChild(label);
    var detail = EV.el('div', 'sp-panel__detail');
    var ruleBox = EV.el('div', 'sp-rule');
    ruleBox.style.display = 'none';
    var ruleChip = EV.el('div', 'chip chip--rule');
    var ruleText = EV.el('div', 'sp-rule__text');
    ruleBox.appendChild(ruleChip);
    ruleBox.appendChild(ruleText);
    panel.appendChild(top);
    panel.appendChild(detail);
    panel.appendChild(ruleBox);
    wrap.appendChild(panel);

    // ---- Prev / Next nav ----
    var nav = EV.el('div', 'sp-nav');
    var prevBtn = EV.el('button', 'btn', '‹ Prev');
    prevBtn.type = 'button';
    var nextBtn = EV.el('button', 'btn btn--primary', 'Next ›');
    nextBtn.type = 'button';
    var hint = EV.el('div', 'sp-nav__hint', 'Click a step, use Prev/Next, or press Play to auto-advance.');
    var spacer = EV.el('div', 'sp-spacer');
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    nav.appendChild(spacer);
    nav.appendChild(hint);
    wrap.appendChild(nav);

    prevBtn.addEventListener('click', function () { if (i > 0) go(i - 1, false); });
    nextBtn.addEventListener('click', function () { if (i < N - 1) go(i + 1, false); });

    container.appendChild(wrap);

    // ---- state ----
    var i = 0;               // current step index
    var playing = false;
    var timer = null;
    var STEP_MS = 1600;

    function highlightNodes(m) {
      Object.keys(cards).forEach(function (k) {
        cards[k].classList.toggle('is-hot', k === m.from || k === m.to);
      });
      // arrow lives between adjacent nodes; find the index pair and direction.
      var fromIdx = -1, toIdx = -1;
      nodes.forEach(function (n, idx) {
        if (n.id === m.from) fromIdx = idx;
        if (n.id === m.to) toIdx = idx;
      });
      var betweenIdx = Math.min(fromIdx, toIdx); // arrow[k] sits between k and k+1
      var goingRight = toIdx > fromIdx;
      arrows.forEach(function (a, idx) {
        a.className = 'sp-arrow';
        if (idx === betweenIdx) {
          a.textContent = goingRight ? '→' : '←';
          a.classList.add('is-on', m.kind === 'req' ? 'is-req' : 'is-res');
        } else {
          a.textContent = '';
        }
      });
    }

    function paint(m) {
      var dir = m.kind === 'req' ? 'req' : 'res';
      var arrow = m.kind === 'req' ? '→' : '←';
      count.textContent = 'Step ' + (i + 1) + ' of ' + N;
      label.innerHTML = '<span class="' + dir + '">' + arrow + ' ' + m.label + '</span>';
      detail.textContent = m.detail;

      if (m.rule) {
        var r = ruleById[m.rule];
        ruleChip.textContent = 'rule · ' + (r ? r.short : m.rule);
        ruleText.textContent = r ? r.text : '';
        ruleBox.style.display = '';
      } else {
        ruleBox.style.display = 'none';
      }

      pips.forEach(function (p, idx) {
        p.className = 'sp-pip';
        if (idx < i) p.classList.add('is-past');
        if (idx === i) p.classList.add('is-current', m.kind === 'req' ? 'is-req' : 'is-res');
      });

      highlightNodes(m);

      prevBtn.disabled = (i === 0);
      nextBtn.disabled = (i === N - 1);

      // gentle flash on change
      panel.classList.remove('sp-flash');
      // force reflow so the animation restarts each step
      void panel.offsetWidth;
      panel.classList.add('sp-flash');
    }

    // Move to step idx. autoFromPlay=true means the auto-timer drove it.
    function go(idx, autoFromPlay) {
      i = Math.max(0, Math.min(N - 1, idx));
      paint(messages[i]);
      if (!autoFromPlay) {
        // a manual jump cancels any running auto-advance.
        if (playing) {
          playing = false;
          if (timer) { clearTimeout(timer); timer = null; }
        }
        ctx.onState(i === N - 1 ? 'done' : 'paused');
      }
    }

    function tick() {
      if (!playing) return;
      if (i >= N - 1) {
        playing = false;
        timer = null;
        ctx.onState('done');
        return;
      }
      go(i + 1, true);
      timer = setTimeout(tick, STEP_MS);
    }

    function play() {
      if (playing) return;
      if (i >= N - 1) i = 0; // restart from the top if at the end
      paint(messages[i]);
      playing = true;
      ctx.onState('playing');
      timer = setTimeout(tick, STEP_MS);
    }

    function pause() {
      playing = false;
      if (timer) { clearTimeout(timer); timer = null; }
      ctx.onState('paused');
    }

    function reset() {
      playing = false;
      if (timer) { clearTimeout(timer); timer = null; }
      i = 0;
      paint(messages[i]);
      ctx.onState('paused');
    }

    function destroy() {
      playing = false;
      if (timer) { clearTimeout(timer); timer = null; }
      prevBtn.replaceWith(prevBtn.cloneNode(true));
      nextBtn.replaceWith(nextBtn.cloneNode(true));
      // pips/listeners go away with the container teardown by the shell.
    }

    // initial paint
    paint(messages[i]);
    ctx.onState('paused');

    return { play: play, pause: pause, reset: reset, destroy: destroy };
  }

  EV.register({
    id: 'stepper',
    label: 'D · Step-through',
    tabDesc: 'click hop by hop',
    blurb: 'Read the round trip at your own pace — Prev/Next or click a step, with full per-hop explanation and the contract rule it depends on.',
    mount: mount,
  });
})();
