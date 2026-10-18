// Toy model of the Management dashboard's layout presets (mirrors client/src/manage/viewPresets.js).
const TABS = ['Status', 'Kanban', 'Subagents', 'Memory', 'Prompts', 'Arch'];
const st = { shown: ['Status', 'Kanban', 'Subagents'], w: { Status: 1, Kanban: 1, Subagents: 2, Memory: 1, Prompts: 1, Arch: 2 }, presets: [], active: null };
const $ = (id) => document.getElementById(id);

document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#nav button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('on', s.id === b.dataset.s));
}));

const view = () => { const w = st.shown.map((k) => st.w[k]); const s = w.reduce((a, b) => a + b, 0); return { panes: [...st.shown], fractions: w.map((x) => x / s) }; };
const modified = () => {
  const p = st.presets.find((x) => x.id === st.active);
  if (!p) return false;
  const v = view();
  return p.panes.join() !== v.panes.join() || p.fractions.some((f, i) => Math.abs(f - v.fractions[i]) > 0.01);
};
const apply = (p) => { st.active = p.id; st.shown = [...p.panes]; p.panes.forEach((k, i) => { st.w[k] = p.fractions[i] * p.panes.length; }); render(); };
const save = () => {
  if (st.presets.length >= 9) return;
  const v = view();
  const p = { id: 'p' + Date.now().toString(36), name: v.panes.join(' | '), panes: v.panes, fractions: v.fractions.map((f) => Math.round(f * 1000) / 1000) };
  st.presets.push(p); st.active = p.id; render();
};

function render() {
  $('ftabs').innerHTML = '';
  for (const k of TABS) {
    const b = document.createElement('button');
    b.className = 'ftab' + (st.shown.includes(k) ? ' on' : '');
    b.textContent = k;
    b.onclick = () => { if (st.shown.includes(k)) { if (st.shown.length > 1) st.shown = st.shown.filter((x) => x !== k); } else st.shown.push(k); render(); };
    $('ftabs').appendChild(b);
  }
  $('plist').innerHTML = '';
  if (!st.presets.length) $('plist').innerHTML = '<span class="mut"><i>none yet</i></span>';
  const mod = modified();
  st.presets.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'ptab' + (p.id === st.active ? ' on' : '') + (p.id === st.active && mod ? ' mod' : '');
    b.textContent = '🔖 ' + p.name + (p.id === st.active && mod ? ' •' : '');
    b.title = 'Alt+' + (i + 1);
    b.onclick = () => apply(p);
    $('plist').appendChild(b);
  });
  $('modbox').innerHTML = '';
  if (mod) {
    const p = st.presets.find((x) => x.id === st.active);
    const u = document.createElement('button'); u.className = 'btn'; u.textContent = '⟳ Update preset';
    u.onclick = () => { const v = view(); p.panes = v.panes; p.fractions = v.fractions; render(); };
    const r = document.createElement('button'); r.className = 'btn'; r.textContent = '↶ Revert'; r.onclick = () => apply(p);
    $('modbox').append(' modified ', u, ' ', r);
  }
  const split = $('split');
  split.innerHTML = '';
  st.shown.forEach((k, i) => {
    if (i > 0) {
      const g = document.createElement('div'); g.className = 'gut';
      g.onpointerdown = (e) => drag(e, st.shown[i - 1], k);
      split.appendChild(g);
    }
    const p = document.createElement('div'); p.className = 'pane'; p.style.flex = `${st.w[k]} 1 0px`; p.dataset.k = k;
    p.innerHTML = `<h4>${k}</h4><div class="fill">${Math.round(view().fractions[i] * 100)}%</div>`;
    split.appendChild(p);
  });
  $('json').textContent = st.presets.length ? JSON.stringify(st.presets.map(({ name, panes, fractions }) => ({ name, panes, fractions })), null, 1) : '(no presets saved)';
}

function drag(e, a, b) {
  const pa = $('split').querySelector(`[data-k="${a}"]`); const pb = $('split').querySelector(`[data-k="${b}"]`);
  const wa = pa.getBoundingClientRect().width; const wb = pb.getBoundingClientRect().width; const pair = wa + wb;
  const pw = st.w[a] + st.w[b]; const x0 = e.clientX; const g = e.currentTarget;
  g.setPointerCapture(e.pointerId);
  const mv = (ev) => { const nl = Math.max(60, Math.min(pair - 60, wa + ev.clientX - x0)); st.w[a] = pw * nl / pair; st.w[b] = pw * (1 - nl / pair); render(); };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}

$('save').onclick = save;
window.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey) return;
  if (e.shiftKey && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  const m = /^Digit([1-9])$/.exec(e.code); if (m && st.presets[m[1] - 1]) { e.preventDefault(); apply(st.presets[m[1] - 1]); }
});
render();
