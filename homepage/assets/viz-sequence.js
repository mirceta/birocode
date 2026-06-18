// Variant B — Sequence. A UML-style sequence diagram: three vertical lifelines
// (one per actor) with dashed lines dropping down. Each message draws, in order,
// a horizontal arrow between the two lifelines one row lower than the last —
// blue for requests (→), green for responses (←). The arrow strokes itself in
// while a dot rides along, then holds before the next. Finished arrows stay
// drawn but dimmed, so the completed diagram reads as a full sequence chart.
//
// Matches the reference controller shape: mount(container, ctx) returns
// { play, pause, reset, destroy }.

(function () {
  var EV = window.ExposureViz;
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ---- inject scoped styles (do not touch styles.css) ----
  var STYLE_ID = 'seq-variant-styles';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.seq-wrap { position: relative; padding: 6px 0 4px; }',
      '.seq-heads { position: relative; display: flex; justify-content: space-between; gap: 14px; z-index: 1; }',
      '.seq-head { width: 30%; max-width: 240px; }',
      '.seq-svg { display: block; width: 100%; overflow: visible; }',
      '.seq-lifeline { stroke: var(--edge); stroke-width: 2; stroke-dasharray: 4 6; }',
      '.seq-arrow { fill: none; stroke-width: 2.4; stroke-linecap: round;',
      '  stroke-dasharray: var(--len); stroke-dashoffset: var(--len); transition: opacity .25s; }',
      '.seq-arrow.is-req { stroke: var(--req); }',
      '.seq-arrow.is-res { stroke: var(--res); }',
      '.seq-arrow.is-past { opacity: .32; }',
      '.seq-arrow.is-active { opacity: 1; filter: drop-shadow(0 0 5px currentColor); }',
      '.seq-head-poly { transition: opacity .25s; }',
      '.seq-head-poly.is-req { fill: var(--req); }',
      '.seq-head-poly.is-res { fill: var(--res); }',
      '.seq-head-poly.is-past { opacity: .32; }',
      '.seq-head-poly.is-active { opacity: 1; }',
      '.seq-dot { fill: var(--ink); opacity: 0; }',
      '.seq-dot.is-req { fill: var(--req); filter: drop-shadow(0 0 6px var(--req)); }',
      '.seq-dot.is-res { fill: var(--res); filter: drop-shadow(0 0 6px var(--res)); }',
      '.seq-label { font-family: var(--mono); font-size: 11px; transition: opacity .25s; }',
      '.seq-label.is-req { fill: var(--req); }',
      '.seq-label.is-res { fill: var(--res); }',
      '.seq-label.is-past { opacity: .4; }',
      '.seq-label.is-active { opacity: 1; }',
      '.seq-chip { position: absolute; transform: translate(-50%, -50%);',
      '  white-space: nowrap; pointer-events: none; transition: opacity .2s; }',
      '.seq-headline { display: flex; align-items: center; }',
      '.seq-head.is-hot { border-color: var(--accent);',
      '  box-shadow: 0 0 0 1px var(--accent), 0 8px 30px -10px color-mix(in srgb, var(--accent) 60%, transparent); }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function mount(container, ctx) {
    var nodes = ctx.nodes, messages = ctx.messages;

    var reduceMotion = false;
    try {
      reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { reduceMotion = false; }

    // ---- DOM scaffold ----
    var wrap = EV.el('div', 'seq-wrap');

    // header boxes (one per lifeline)
    var heads = EV.el('div', 'seq-heads');
    var headEls = {};
    nodes.forEach(function (n) {
      var box = EV.el('div', 'node seq-head');
      box.innerHTML =
        '<div class="node__glyph">' + n.glyph + '</div>' +
        '<div class="node__title">' + n.title + '</div>' +
        '<div class="node__sub">' + n.sub + '</div>';
      headEls[n.id] = box;
      heads.appendChild(box);
    });

    // SVG holds the lifelines + arrows + traveling dot.
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'seq-svg');

    wrap.appendChild(heads);
    wrap.appendChild(svg);

    var caption = EV.el('div', 'caption');
    var capLabel = EV.el('div', 'caption__label');
    var capDetail = EV.el('div', 'caption__detail');
    caption.appendChild(capLabel);
    caption.appendChild(capDetail);

    container.appendChild(wrap);
    container.appendChild(caption);

    // ---- geometry ----
    var ROW = 38;        // px per message row
    var TOP = 26;        // px from svg top to first row
    var BOT = 16;        // padding below last row
    var lifeX = {};      // node id -> x within svg
    var rows = [];       // per-message rendered pieces
    var dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', 'seq-dot');
    dot.setAttribute('r', '5');

    // Chips live as HTML overlay (so we can reuse .chip.chip--rule).
    var chips = [];

    function centerX(id) {
      var hr = headEls[id].getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      return hr.left - wr.left + hr.width / 2;
    }

    function clearSvg() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      rows = [];
      chips.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
      chips = [];
    }

    // Build all lifelines + arrows once; animation just toggles classes/offset.
    function build() {
      clearSvg();

      var height = TOP + messages.length * ROW + BOT;
      svg.setAttribute('height', height);
      var wr = wrap.getBoundingClientRect();
      svg.setAttribute('width', wr.width);
      svg.setAttribute('viewBox', '0 0 ' + wr.width + ' ' + height);

      nodes.forEach(function (n) { lifeX[n.id] = centerX(n.id); });

      // vertical lifelines
      nodes.forEach(function (n) {
        var ll = document.createElementNS(SVGNS, 'line');
        ll.setAttribute('class', 'seq-lifeline');
        ll.setAttribute('x1', lifeX[n.id]);
        ll.setAttribute('x2', lifeX[n.id]);
        ll.setAttribute('y1', 2);
        ll.setAttribute('y2', height - 2);
        svg.appendChild(ll);
      });

      // arrows, top -> down
      messages.forEach(function (m, idx) {
        var y = TOP + idx * ROW;
        var x1 = lifeX[m.from], x2 = lifeX[m.to];
        var dir = x2 >= x1 ? 1 : -1;
        var kindCls = m.kind === 'req' ? 'is-req' : 'is-res';
        var len = Math.abs(x2 - x1);

        var path = document.createElementNS(SVGNS, 'line');
        path.setAttribute('class', 'seq-arrow ' + kindCls);
        path.setAttribute('x1', x1);
        path.setAttribute('x2', x2 - dir * 7); // stop short for arrowhead
        path.setAttribute('y1', y);
        path.setAttribute('y2', y);
        path.style.setProperty('--len', len);
        svg.appendChild(path);

        // arrowhead (triangle) pointing toward `to`
        var head = document.createElementNS(SVGNS, 'polygon');
        head.setAttribute('class', 'seq-head-poly ' + kindCls);
        var hx = x2;
        head.setAttribute('points',
          hx + ',' + y + ' ' +
          (hx - dir * 9) + ',' + (y - 4) + ' ' +
          (hx - dir * 9) + ',' + (y + 4));
        svg.appendChild(head);

        // label (monospace) above the arrow, anchored at the arrow midpoint
        var midX = (x1 + x2) / 2;
        var label = document.createElementNS(SVGNS, 'text');
        label.setAttribute('class', 'seq-label ' + kindCls);
        label.setAttribute('x', midX);
        label.setAttribute('y', y - 6);
        label.setAttribute('text-anchor', 'middle');
        label.textContent = m.label;
        svg.appendChild(label);

        // optional rule chip as an HTML overlay near the arrow
        var chip = null;
        if (m.rule) {
          chip = EV.el('span', 'chip chip--rule seq-chip', 'rule · ' + m.rule);
          chip.style.left = midX + 'px';
          chip.style.top = (y + 14) + 'px';
          chip.style.opacity = '0';
          wrap.appendChild(chip);
          chips.push(chip);
        }

        rows.push({ path: path, head: head, label: label, chip: chip,
          x1: x1, x2: x2 - dir * 7, y: y, len: len, kindCls: kindCls });
      });

      // dot rides above arrows
      svg.appendChild(dot);

      applyRowStates();
    }

    // Reflect the current index across all rows (past / active / future).
    function applyRowStates() {
      rows.forEach(function (r, idx) {
        var path = r.path, head = r.head, label = r.label, chip = r.chip;
        path.classList.remove('is-active', 'is-past');
        head.classList.remove('is-active', 'is-past');
        label.classList.remove('is-active', 'is-past');
        if (idx < i) {
          // fully drawn, dimmed
          path.style.strokeDashoffset = '0';
          path.classList.add('is-past');
          head.classList.add('is-past');
          label.classList.add('is-past');
          if (chip) chip.style.opacity = '0.5';
        } else if (idx === i && drawnCurrent) {
          path.style.strokeDashoffset = '0';
          path.classList.add('is-active');
          head.classList.add('is-active');
          label.classList.add('is-active');
          if (chip) chip.style.opacity = '1';
        } else {
          // not yet drawn
          path.style.strokeDashoffset = r.len;
          if (chip) chip.style.opacity = '0';
        }
      });
    }

    // ---- animation engine ----
    var i = 0;               // current message index
    var drawnCurrent = false;// is the current row fully drawn?
    var rafId = null;
    var holdTimer = null;
    var playing = false;
    var startTs = 0;
    var DUR = reduceMotion ? 1 : 980;  // ms per arrow draw
    var HOLD = reduceMotion ? 200 : 520;

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function paintCaption(m) {
      var dir = m.kind === 'req' ? 'req' : 'res';
      var arrow = m.kind === 'req' ? '→' : '←';
      capLabel.innerHTML = '<span class="' + dir + '">' + arrow + ' ' + m.label + '</span>' +
        (m.rule ? ' <span class="chip chip--rule">rule · ' + m.rule + '</span>' : '');
      capDetail.textContent = m.detail;
    }

    function highlight(id) {
      Object.keys(headEls).forEach(function (k) {
        headEls[k].classList.toggle('is-hot', k === id);
      });
    }

    function beginRow() {
      var m = messages[i];
      var r = rows[i];
      drawnCurrent = false;
      paintCaption(m);
      highlight(m.from);
      applyRowStates();
      // bring the active row to bright while drawing
      r.path.classList.remove('is-past');
      r.path.classList.add('is-active');
      r.head.classList.add('is-active');
      r.label.classList.add('is-active');
      if (r.chip) r.chip.style.opacity = '1';
      dot.setAttribute('class', 'seq-dot ' + r.kindCls);
      dot.setAttribute('cy', r.y);
      dot.style.opacity = '1';
      startTs = 0;
      rafId = requestAnimationFrame(step);
    }

    function step(ts) {
      if (!playing) return;
      if (!startTs) startTs = ts;
      var r = rows[i];
      var t = Math.min(1, (ts - startTs) / DUR);
      var e = easeInOut(t);
      // draw the arrow: reduce dashoffset from len -> 0
      r.path.style.strokeDashoffset = (r.len * (1 - e)).toString();
      // move the dot along the arrow
      dot.setAttribute('cx', r.x1 + (r.x2 - r.x1) * e);
      if (t >= 0.55) highlight(messages[i].to);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        drawnCurrent = true;
        dot.style.opacity = '0';
        holdTimer = setTimeout(function () {
          i++;
          if (i >= messages.length) {
            playing = false;
            applyRowStates();
            ctx.onState('done');
            return;
          }
          beginRow();
        }, HOLD);
      }
    }

    function play() {
      if (playing) return;
      if (i >= messages.length) reset(true);
      playing = true;
      ctx.onState('playing');
      build();
      beginRow();
    }
    function pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (holdTimer) clearTimeout(holdTimer);
      dot.style.opacity = '0';
      ctx.onState('paused');
    }
    function reset(silent) {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (holdTimer) clearTimeout(holdTimer);
      i = 0;
      drawnCurrent = false;
      dot.style.opacity = '0';
      highlight(null);
      build();
      capLabel.textContent = '';
      capDetail.textContent = 'Press Play to watch the round trip drawn as a sequence chart — Local tab to your app on :5305 and back.';
      if (!silent) ctx.onState('paused');
    }
    function destroy() {
      pause();
      window.removeEventListener('resize', onResize);
    }

    // Rebuild geometry on resize (keeps current progress).
    function onResize() {
      var savedI = i, savedDrawn = drawnCurrent, savedPlaying = playing;
      if (rafId) cancelAnimationFrame(rafId);
      if (holdTimer) clearTimeout(holdTimer);
      build();
      i = savedI; drawnCurrent = savedDrawn;
      applyRowStates();
      if (savedPlaying) { playing = true; beginRow(); }
    }
    window.addEventListener('resize', onResize);

    // initial paint (after layout settles so centerX is correct)
    requestAnimationFrame(function () { reset(); });

    return { play: play, pause: pause, reset: reset, destroy: destroy };
  }

  EV.register({
    id: 'sequence',
    label: 'B · Sequence',
    tabDesc: 'animated lifelines',
    blurb: 'A UML-style sequence chart: arrows draw between three lifelines, top to bottom, building the full round trip.',
    mount: mount,
  });
})();
