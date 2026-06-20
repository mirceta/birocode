// Interactive sequence-diagram explainer for a system-test suite. Build-less,
// vanilla, relative-URL only (runs under the Local-tab proxy sub-path). Reads the
// suite's `flow` (attached to the catalog by the server from hub/flows.json) and
// draws an SVG sequence diagram: actors as lifelines, each step's interactions as
// arrows between them. Click a step to focus it; ▶ Play walks the whole suite
// interaction-by-interaction so you can watch what actually happens.
//
// Exposed as window.SysTestDiagram.open(suite).
(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---- layout constants ------------------------------------------------------
  const COL = 220;          // px between lifelines
  const PAD = 24;           // left/right padding
  const HEAD_TOP = 14;      // actor header box y
  const HEAD_H = 38;
  const LIFE_TOP = 66;      // where lifelines + bands start
  const BAND_HEAD = 30;     // step-label band header height
  const ROW = 52;           // px per interaction row
  const ROW_PAD = 22;       // gap from band header to first arrow
  const BAND_GAP = 14;      // gap between step bands

  let overlay = null;       // lazily-created modal root
  let state = null;         // { flow, flat, lifeX, focus, playing, timer, p }

  // ---- modal scaffolding -----------------------------------------------------
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'diag-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="diag-modal" role="dialog" aria-modal="true" aria-label="System-test diagram">
        <div class="diag-head">
          <h3 class="diag-title"></h3>
          <span class="diag-sub"></span>
          <button class="btn ghost diag-close" title="Close (Esc)">✕</button>
        </div>
        <div class="diag-body">
          <ol class="diag-steps"></ol>
          <div class="diag-stage">
            <div class="diag-toolbar">
              <button class="btn diag-play">▶ Play</button>
              <button class="btn ghost diag-reset">⟲ Reset</button>
              <span class="diag-progress muted"></span>
              <span class="grow"></span>
              <span class="diag-legend"></span>
            </div>
            <div class="diag-scroll"><svg class="diag-svg" xmlns="${SVGNS}"></svg></div>
            <div class="diag-detail"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.diag-close').onclick = close;
    overlay.querySelector('.diag-play').onclick = togglePlay;
    overlay.querySelector('.diag-reset').onclick = () => { stopPlay(); focusStep(0); };
    return overlay;
  }

  function close() {
    stopPlay();
    if (overlay) overlay.hidden = true;
    document.removeEventListener('keydown', onKey);
    state = null;
  }
  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); focusStep(state.focus + 1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); focusStep(state.focus - 1); }
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  }

  // ---- public entry ----------------------------------------------------------
  function open(suite) {
    ensureOverlay();
    overlay.hidden = false;
    overlay.querySelector('.diag-title').textContent = suite.title;
    const flow = suite.flow;
    overlay.querySelector('.diag-sub').textContent = flow
      ? `${flow.steps.length} step${flow.steps.length === 1 ? '' : 's'} · ${flow.actors.length} actors`
      : '';
    const stage = overlay.querySelector('.diag-stage');
    const stepsEl = overlay.querySelector('.diag-steps');
    if (!flow || !flow.steps || !flow.steps.length) {
      stepsEl.innerHTML = '';
      stage.querySelector('.diag-scroll').innerHTML =
        '<div class="diag-empty">No diagram defined for this suite yet.<br><span class="muted">Add it under this suite\'s id in <code>hub/flows.json</code>.</span></div>';
      stage.querySelector('.diag-detail').innerHTML = '';
      stage.querySelector('.diag-progress').textContent = '';
      return;
    }
    buildLegend();
    render(flow);
    document.addEventListener('keydown', onKey);
    focusStep(0);
  }

  function buildLegend() {
    const items = [['req', 'request'], ['res', 'response'], ['event', 'stream'], ['spawn', 'spawn CLI'], ['store', 'disk']];
    overlay.querySelector('.diag-legend').innerHTML = items
      .map(([k, label]) => `<span class="lg lg-${k}"><i></i>${label}</span>`).join('');
  }

  // ---- render ----------------------------------------------------------------
  function render(flow) {
    const actors = flow.actors;
    const lifeX = {};
    actors.forEach((a, i) => { lifeX[a.id] = PAD + COL * i + COL / 2; });
    const width = PAD * 2 + COL * actors.length;

    // Flatten interactions across steps for play-through + per-row geometry.
    const flat = [];
    let y = LIFE_TOP;
    const bands = [];
    flow.steps.forEach((st, si) => {
      const bandTop = y;
      const rows = st.interactions.length;
      const bandH = BAND_HEAD + ROW_PAD + rows * ROW;
      bands.push({ si, top: bandTop, h: bandH, step: st });
      st.interactions.forEach((ix, ii) => {
        const ry = bandTop + BAND_HEAD + ROW_PAD + ii * ROW;
        flat.push({ si, ii, ix, y: ry, fromX: lifeX[ix.from], toX: lifeX[ix.to] });
      });
      y = bandTop + bandH + BAND_GAP;
    });
    const height = y + 10;

    const svg = overlay.querySelector('.diag-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.minWidth = width + 'px';

    let s = '';
    // step bands (behind lifelines)
    for (const b of bands) {
      s += `<rect class="band" data-step="${b.si}" x="8" y="${b.top}" width="${width - 16}" height="${b.h}" rx="10"></rect>`;
      s += `<text class="band-label" x="20" y="${b.top + 19}">${b.si + 1}. ${esc(b.step.title)}</text>`;
    }
    // lifelines + actor heads
    actors.forEach((a) => {
      const x = lifeX[a.id];
      s += `<line class="lifeline" x1="${x}" y1="${LIFE_TOP}" x2="${x}" y2="${height - 8}"></line>`;
      const bw = COL - 36;
      s += `<g class="actor actor-${esc(a.id)}">`
        + `<rect x="${x - bw / 2}" y="${HEAD_TOP}" width="${bw}" height="${HEAD_H}" rx="8"></rect>`
        + `<text x="${x}" y="${HEAD_TOP + HEAD_H / 2 + 4}">${esc(a.label)}</text></g>`;
    });
    // arrows
    flat.forEach((f, idx) => { s += arrowSvg(f, idx); });

    svg.innerHTML = s;

    // step list
    const stepsEl = overlay.querySelector('.diag-steps');
    stepsEl.innerHTML = flow.steps.map((st, si) =>
      `<li class="diag-step" data-step="${si}"><span class="n">${si + 1}</span>`
      + `<span class="t">${esc(st.title)}</span></li>`).join('');
    stepsEl.querySelectorAll('.diag-step').forEach((li) => {
      li.onclick = () => { stopPlay(); focusStep(Number(li.dataset.step)); };
    });
    // clicking a band or arrow focuses its step too
    svg.querySelectorAll('[data-step]').forEach((node) => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => { stopPlay(); focusStep(Number(node.dataset.step)); });
    });

    state = { flow, flat, bands, lifeX, width, height, focus: -1, playing: false, timer: null, p: -1 };
  }

  // One arrow (or self-loop) for an interaction.
  function arrowSvg(f, idx) {
    const { ix, y, fromX, toX } = f;
    const kind = ix.kind || 'req';
    const cls = `ix kind-${kind}${ix.ok === false ? ' bad' : ''}`;
    const da = `data-step="${f.si}" data-ix="${idx}"`;
    const label = esc(ix.label || '');
    if (fromX === toX) {
      // self-message: a small loop to the right of the lifeline
      const x = fromX, w = 30, h = 22;
      const path = `M ${x} ${y} h ${w} v ${h} h ${-w}`;
      return `<g class="${cls}" ${da}>`
        + `<path class="ln" d="${path}" fill="none"></path>`
        + `<polygon class="head" points="${x + 6},${y + h - 5} ${x},${y + h} ${x + 6},${y + h + 5}"></polygon>`
        + `<text class="lbl" x="${x + w + 8}" y="${y + h / 2 + 4}" text-anchor="start">${label}</text></g>`;
    }
    const dir = toX > fromX ? 1 : -1;
    const x2 = toX - dir * 7; // stop short so the head sits on the lifeline
    const midX = (fromX + toX) / 2;
    const head = `${x2 - dir * 9},${y - 5} ${x2},${y} ${x2 - dir * 9},${y + 5}`;
    return `<g class="${cls}" ${da}>`
      + `<line class="ln" x1="${fromX}" y1="${y}" x2="${x2}" y2="${y}"></line>`
      + `<polygon class="head" points="${head}"></polygon>`
      + `<text class="lbl" x="${midX}" y="${y - 8}" text-anchor="middle">${label}</text></g>`;
  }

  // ---- focus + play ----------------------------------------------------------
  function focusStep(i) {
    if (!state) return;
    const n = state.flow.steps.length;
    i = Math.max(0, Math.min(n - 1, i));
    state.focus = i;
    const svg = overlay.querySelector('.diag-svg');
    svg.classList.add('has-focus');
    svg.querySelectorAll('.band').forEach((b) => b.classList.toggle('focus', Number(b.dataset.step) === i));
    svg.querySelectorAll('.ix').forEach((g) => g.classList.toggle('on', Number(g.dataset.step) === i));
    overlay.querySelectorAll('.diag-step').forEach((li) => li.classList.toggle('active', Number(li.dataset.step) === i));

    const band = state.bands.find((b) => b.si === i);
    if (band) {
      const scroll = overlay.querySelector('.diag-scroll');
      const ratio = scroll.scrollHeight / state.height;
      const target = band.top * ratio - 70;
      scroll.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
    renderDetail(i, null);
  }

  function renderDetail(i, activeIx) {
    const st = state.flow.steps[i];
    const checks = (st.checks || []).map((c) => `<li>${esc(c)}</li>`).join('');
    const active = activeIx != null
      ? `<div class="d-now"><span class="muted">now:</span> ${esc(state.flat[activeIx].ix.label)}</div>` : '';
    overlay.querySelector('.diag-detail').innerHTML =
      `<div class="d-title">${esc(st.title)}${st.scenario ? ` <span class="d-scen">scenario #${esc(st.scenario)}</span>` : ''}</div>`
      + `<div class="d-sum">${esc(st.summary || '')}</div>`
      + active
      + (checks ? `<div class="d-checks-h">What it verifies</div><ul class="d-checks">${checks}</ul>` : '');
  }

  function setActiveIx(idx) {
    const svg = overlay.querySelector('.diag-svg');
    svg.querySelectorAll('.ix.playing').forEach((g) => g.classList.remove('playing'));
    if (idx == null) return;
    const g = svg.querySelector(`.ix[data-ix="${idx}"]`);
    if (g) {
      g.classList.add('playing');
      const f = state.flat[idx];
      if (f.si !== state.focus) focusStep(f.si);
      renderDetail(f.si, idx);
      // keep the playing arrow in view
      const scroll = overlay.querySelector('.diag-scroll');
      const ratio = scroll.scrollHeight / state.height;
      const top = f.y * ratio;
      if (top < scroll.scrollTop + 60 || top > scroll.scrollTop + scroll.clientHeight - 60) {
        scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight / 2), behavior: 'smooth' });
      }
    }
    const tot = state.flat.length;
    overlay.querySelector('.diag-progress').textContent = `interaction ${idx + 1} / ${tot}`;
  }

  function togglePlay() { if (!state) return; state.playing ? stopPlay() : startPlay(); }
  function startPlay() {
    if (!state || state.playing) return;
    state.playing = true;
    overlay.querySelector('.diag-play').textContent = '⏸ Pause';
    if (state.p >= state.flat.length - 1) state.p = -1; // restart if at end
    tick();
  }
  function stopPlay() {
    if (!state) return;
    state.playing = false;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    const play = overlay.querySelector('.diag-play');
    if (play) play.textContent = '▶ Play';
    setActiveIx(null);
  }
  function tick() {
    if (!state || !state.playing) return;
    state.p += 1;
    if (state.p >= state.flat.length) { stopPlay(); return; }
    setActiveIx(state.p);
    state.timer = setTimeout(tick, 1100);
  }

  window.SysTestDiagram = { open, close };
})();
