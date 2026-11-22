// Before / after simulator for idea #33 (mirrors client/src/pages/agentKeepAlive.js).
const AGENTS = ['pers-dec', 'game-arcade', 'scraper', 'research', 'homepage', 'arcade-2', 'notes', 'kanban'];
const MAX_KEPT = 6;
const $ = (id) => document.getElementById(id);
const before = { shown: null };
const after = { shown: null, kept: [] };

document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#nav button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('on', s.id === b.dataset.s));
}));

function nextKept(kept, id) { return [id, ...kept.filter((x) => x !== id)].slice(0, MAX_KEPT); }
const log = (el, line) => { el.textContent += line + '\n'; el.scrollTop = el.scrollHeight; };

function paint(screenEl, name, reloaded) {
  screenEl.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'dock' + (reloaded ? ' flash' : '');
  d.innerHTML = `${name}<small>${reloaded ? 'loading transcript, app frames…' : 'as you left it'}</small>`;
  screenEl.appendChild(d);
}

function tap(name) {
  // before: one dock mounted — every switch remounts
  before.shown = name;
  paint($('s-before'), name, true);
  log($('l-before'), `open-agent ${name} → unmount, mount, fetch transcript, reload frames`);
  // after: mounted once, then switched
  const first = !after.kept.includes(name);
  const dropped = first && after.kept.length >= MAX_KEPT ? after.kept[after.kept.length - 1] : null;
  after.kept = nextKept(after.kept, name);
  after.shown = name;
  paint($('s-after'), name, first);
  log($('l-after'), first ? `open-agent ${name} → first visit: mount + load${dropped ? ` (unmount least recent: ${dropped})` : ''}` : `open-agent ${name} → switch (already mounted, nothing loads)`);
  $('k-after').innerHTML = 'kept: ' + after.kept.map((k) => `<span class="${k === name ? 'vis' : ''}">${k}</span>`).join('');
  document.querySelectorAll('#phone .btn').forEach((b) => b.classList.toggle('on', b.textContent === name));
}

for (const a of AGENTS) {
  const b = document.createElement('button');
  b.className = 'btn'; b.textContent = a; b.onclick = () => tap(a);
  $('phone').appendChild(b);
}
tap('pers-dec');
