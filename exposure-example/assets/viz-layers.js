// Variant C — Layers. The three actors are stacked as full-width horizontal
// bands, top→bottom: Browser, Harness (:5099), then a labeled loopback boundary
// (dashed divider · "loopback · 127.0.0.1 + [::1]"), then Your app (:5305). A
// glowing token DESCENDS through the layers for requests and ASCENDS for
// responses. When a hop crosses the loopback boundary, the boundary pulses
// (--warn) and the contract-rule chip lights up. Reads as: the request dives
// down to your app and the answer climbs back up.
//
// Controller shape matches the reference (viz-pipeline.js) exactly:
// mount(container, ctx) returns { play, pause, reset, destroy }.

(function () {
  var EV = window.ExposureViz;

  // ---- scoped styles (injected once; never edits styles.css) ----
  if (!document.getElementById('ly-styles')) {
    var style = document.createElement('style');
    style.id = 'ly-styles';
    style.textContent = [
      '.ly-wrap { position: relative; padding: 6px 0 2px; }',
      '.ly-stack { position: relative; display: flex; flex-direction: column; gap: 12px; z-index: 1; }',
      // each actor band is a full-width node card laid out as a row
      '.ly-band { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }',
      '.ly-band .node__glyph { font-size: 26px; }',
      '.ly-band__text { display: flex; flex-direction: column; }',
      '.ly-band__side { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); text-align: right; }',
      // the loopback boundary — the visual star
      '.ly-boundary { position: relative; display: flex; align-items: center; justify-content: center; height: 30px; margin: -2px 0; }',
      '.ly-boundary::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 2px dashed var(--edge); transition: border-color .25s; }',
      '.ly-boundary__cap { position: relative; z-index: 1; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); background: var(--panel); padding: 2px 12px; border: 1px solid var(--edge); border-radius: 999px; transition: color .25s, border-color .25s, box-shadow .25s, background .25s; }',
      '.ly-boundary.is-cross::before { border-top-color: var(--warn); }',
      '.ly-boundary.is-cross .ly-boundary__cap { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 55%, transparent); background: color-mix(in srgb, var(--warn) 12%, var(--panel)); box-shadow: 0 0 22px -4px color-mix(in srgb, var(--warn) 70%, transparent); }',
      // SVG overlay carrying the traveling token
      '.ly-svg { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: visible; }',
      '.ly-token { transition: opacity .2s; }',
      '.ly-token.is-req { fill: var(--req); filter: drop-shadow(0 0 8px var(--req)); }',
      '.ly-token.is-res { fill: var(--res); filter: drop-shadow(0 0 8px var(--res)); }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function mount(container, ctx) {
    var nodes = ctx.nodes, messages = ctx.messages;

    var wrap = EV.el('div', 'ly-wrap');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ly-svg');
    var stack = EV.el('div', 'ly-stack');

    // node id -> band element, for highlighting + center lookup.
    var bands = {};
    // The loopback boundary sits between the harness band and the app band.
    var boundary = EV.el('div', 'ly-boundary');
    var bCap = EV.el('div', 'ly-boundary__cap', 'loopback · 127.0.0.1 + [::1]');
    boundary.appendChild(bCap);

    nodes.forEach(function (n, idx) {
      var band = EV.el('div', 'node ly-band');
      band.innerHTML =
        '<div class="node__glyph">' + n.glyph + '</div>' +
        '<div class="ly-band__text">' +
        '  <div class="node__title">' + n.title + '</div>' +
        '  <div class="node__sub">' + n.sub + '</div>' +
        '</div>';
      bands[n.id] = band;
      stack.appendChild(band);
      // After the middle actor (harness), drop in the loopback boundary so the
      // app band lands below it. nodes order is [browser, harness, app].
      if (idx === 1) stack.appendChild(boundary);
    });

    wrap.appendChild(svg);
    wrap.appendChild(stack);

    var caption = EV.el('div', 'caption');
    var capLabel = EV.el('div', 'caption__label');
    var capDetail = EV.el('div', 'caption__detail');
    caption.appendChild(capLabel);
    caption.appendChild(capDetail);

    container.appendChild(wrap);
    container.appendChild(caption);

    // SVG token that travels vertically between bands.
    var token = document.createElementNS(svg.namespaceURI, 'circle');
    token.setAttribute('r', '9');
    token.setAttribute('class', 'ly-token');
    token.style.opacity = '0';
    svg.appendChild(token);

    // Which actor sits below the boundary? The last node (app). A hop "crosses"
    // the loopback when exactly one endpoint is the app.
    var belowId = nodes[nodes.length - 1].id;
    function crosses(m) {
      return (m.from === belowId) !== (m.to === belowId);
    }

    // Center of a band relative to wrap, in px.
    function centerOf(id) {
      var br = bands[id].getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      return { x: br.left - wr.left + br.width / 2, y: br.top - wr.top + br.height / 2 };
    }
    function sizeSvg() {
      var wr = wrap.getBoundingClientRect();
      svg.setAttribute('width', wr.width);
      svg.setAttribute('height', wr.height);
    }
    window.addEventListener('resize', sizeSvg);

    // ---- animation engine (mirrors the reference) ----
    var i = 0;             // current message index
    var rafId = null;
    var holdTimer = null;
    var playing = false;
    var startTs = 0;
    var fromPt, toPt, isReq;
    var DUR = 1000;        // ms per hop (descend / ascend)
    var HOLD = 520;        // pause between hops

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function paintCaption(m) {
      var dir = m.kind === 'req' ? 'req' : 'res';
      var arrow = m.kind === 'req' ? '↓' : '↑';
      capLabel.innerHTML = '<span class="' + dir + '">' + arrow + ' ' + m.label + '</span>' +
        (m.rule ? ' <span class="chip chip--rule">rule · ' + m.rule + '</span>' : '');
      capDetail.textContent = m.detail;
    }

    function highlight(id) {
      Object.keys(bands).forEach(function (k) { bands[k].classList.toggle('is-hot', k === id); });
    }

    function setBoundary(active) {
      boundary.classList.toggle('is-cross', !!active);
    }

    function beginHop() {
      var m = messages[i];
      isReq = m.kind === 'req';
      fromPt = centerOf(m.from);
      toPt = centerOf(m.to);
      paintCaption(m);
      setBoundary(crosses(m));
      highlight(m.from);
      token.setAttribute('class', 'ly-token ' + (isReq ? 'is-req' : 'is-res'));
      token.style.opacity = '1';
      startTs = 0;
      rafId = requestAnimationFrame(step);
    }

    function step(ts) {
      if (!playing) return;
      if (!startTs) startTs = ts;
      var t = Math.min(1, (ts - startTs) / DUR);
      var e = easeInOut(t);
      token.setAttribute('cx', fromPt.x + (toPt.x - fromPt.x) * e);
      token.setAttribute('cy', fromPt.y + (toPt.y - fromPt.y) * e);
      if (t >= 0.5) highlight(messages[i].to);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        // hop done — hold, then advance.
        holdTimer = setTimeout(function () {
          setBoundary(false);
          i++;
          if (i >= messages.length) {
            playing = false;
            token.style.opacity = '0';
            ctx.onState('done');
            return;
          }
          beginHop();
        }, HOLD);
      }
    }

    function play() {
      if (playing) return;
      if (i >= messages.length) i = 0;
      playing = true;
      ctx.onState('playing');
      sizeSvg();
      beginHop();
    }
    function pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (holdTimer) clearTimeout(holdTimer);
      ctx.onState('paused');
    }
    function reset() {
      pause();
      i = 0;
      token.style.opacity = '0';
      highlight(null);
      setBoundary(false);
      capLabel.textContent = '';
      capDetail.textContent = 'Press Play — the request dives down through the loopback to your app on :5305, and the answer climbs back up.';
      ctx.onState('paused');
    }
    function destroy() {
      pause();
      window.removeEventListener('resize', sizeSvg);
    }

    // initial paint
    requestAnimationFrame(function () { sizeSvg(); reset(); });

    return { play: play, pause: pause, reset: reset, destroy: destroy };
  }

  EV.register({
    id: 'layers',
    label: 'C · Layers',
    tabDesc: 'descend & ascend',
    blurb: 'A token dives down through the loopback boundary to your app and climbs back up.',
    mount: mount,
  });
})();
