// Variant A — Pipeline. Three node cards in a row; a glowing token travels the
// connecting lane for each message (blue = request →, green = response ←). The
// active node lights up and a caption explains the hop + any contract rule.
//
// This is the reference variant: every other variant matches this controller
// shape — mount(container, ctx) returns { play, pause, reset, destroy }.

(function () {
  var EV = window.ExposureViz;

  function mount(container, ctx) {
    var nodes = ctx.nodes, messages = ctx.messages;

    var wrap = EV.el('div', 'pl-wrap');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pl-svg');
    var row = EV.el('div', 'pl-row');

    // node id -> card element, for highlighting + center lookup.
    var cards = {};
    nodes.forEach(function (n) {
      var card = EV.el('div', 'node pl-node');
      card.innerHTML =
        '<div class="node__glyph">' + n.glyph + '</div>' +
        '<div class="node__title">' + n.title + '</div>' +
        '<div class="node__sub">' + n.sub + '</div>';
      cards[n.id] = card;
      row.appendChild(card);
    });

    wrap.appendChild(svg);
    wrap.appendChild(row);

    var caption = EV.el('div', 'caption');
    var capLabel = EV.el('div', 'caption__label');
    var capDetail = EV.el('div', 'caption__detail');
    caption.appendChild(capLabel);
    caption.appendChild(capDetail);

    container.appendChild(wrap);
    container.appendChild(caption);

    // SVG layer: connector line + traveling dot. Sized to the wrap in px.
    var line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('class', 'pl-track');
    var dot = document.createElementNS(svg.namespaceURI, 'circle');
    dot.setAttribute('r', '8');
    dot.setAttribute('class', 'pl-dot');
    dot.style.opacity = '0';
    svg.appendChild(line);
    svg.appendChild(dot);

    // Center of a card relative to wrap, in px.
    function centerOf(id) {
      var cr = cards[id].getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      return { x: cr.left - wr.left + cr.width / 2, y: cr.top - wr.top + cr.height / 2 };
    }
    function sizeSvg() {
      var wr = wrap.getBoundingClientRect();
      svg.setAttribute('width', wr.width);
      svg.setAttribute('height', wr.height);
      var a = centerOf(nodes[0].id), c = centerOf(nodes[nodes.length - 1].id);
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', c.x); line.setAttribute('y2', c.y);
    }
    window.addEventListener('resize', sizeSvg);

    // ---- animation engine ----
    var i = 0;             // current message index
    var rafId = null;
    var holdTimer = null;
    var playing = false;
    var startTs = 0;
    var fromPt, toPt, isReq;
    var DUR = 1050;        // ms per hop
    var HOLD = 520;        // pause between hops

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function paintCaption(m) {
      var dir = m.kind === 'req' ? 'req' : 'res';
      var arrow = m.kind === 'req' ? '→' : '←';
      capLabel.innerHTML = '<span class="' + dir + '">' + arrow + ' ' + m.label + '</span>' +
        (m.rule ? ' <span class="chip chip--rule">rule · ' + m.rule + '</span>' : '');
      capDetail.textContent = m.detail;
    }

    function highlight(id) {
      Object.keys(cards).forEach(function (k) { cards[k].classList.toggle('is-hot', k === id); });
    }

    function beginHop() {
      var m = messages[i];
      isReq = m.kind === 'req';
      fromPt = centerOf(m.from);
      toPt = centerOf(m.to);
      paintCaption(m);
      dot.setAttribute('class', 'pl-dot ' + (isReq ? 'is-req' : 'is-res'));
      dot.style.opacity = '1';
      startTs = 0;
      rafId = requestAnimationFrame(step);
    }

    function step(ts) {
      if (!playing) return;
      if (!startTs) startTs = ts;
      var t = Math.min(1, (ts - startTs) / DUR);
      var e = easeInOut(t);
      dot.setAttribute('cx', fromPt.x + (toPt.x - fromPt.x) * e);
      dot.setAttribute('cy', fromPt.y + (toPt.y - fromPt.y) * e);
      if (t >= 0.5) highlight(messages[i].to);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        // hop done — hold, then advance.
        holdTimer = setTimeout(function () {
          i++;
          if (i >= messages.length) {
            playing = false;
            dot.style.opacity = '0';
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
      dot.style.opacity = '0';
      highlight(null);
      capLabel.textContent = '';
      capDetail.textContent = 'Press Play to watch a request travel from the Local tab to your app on :5305 and back.';
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
    id: 'pipeline',
    label: 'A · Pipeline',
    tabDesc: 'token travels the line',
    blurb: 'A token rides the wire between the three actors — simplest read.',
    mount: mount,
  });
})();
