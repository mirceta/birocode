// A toy of the sentry's state machine (mirrors ClaudeWeb.App/Services/LocalApps/LocalAppSentry.cs).
const $ = (id) => document.getElementById(id);
const STATES = ['unknown', 'starting', 'up', 'down', 'failing'];
const GRACE = 2, COOLDOWN = 15; // minutes
let s;
const reset = () => { s = { state: 'unknown', t: 0, answers: false, broken: false, restarts: 0, lastStart: null, lastRestart: null, seenUp: false }; $('log').textContent = ''; render(); };

document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#nav button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('main section').forEach((x) => x.classList.toggle('on', x.id === b.dataset.s));
}));

const log = (m) => { $('log').textContent += `[t=${s.t} min] ${m}\n`; $('log').scrollTop = 1e9; };
const launch = (why) => { s.lastStart = s.t; s.seenUp = false; log(`${why}: launch the start command (detached)`); if (!s.broken) s.answersSoon = true; };

function probe() {
  if (s.answersSoon) { s.answers = true; s.answersSoon = false; }
  return s.answers;
}

function apply(trigger) {
  s.restarts = 0;
  if (probe()) { s.state = 'up'; s.seenUp = true; log(`${trigger}: already answering → up`); return; }
  launch(trigger); s.state = 'starting';
}

function pass() {
  s.t += 3;
  if (probe()) { if (s.state !== 'up') log('sentry: answers → up'); s.state = 'up'; s.restarts = 0; s.seenUp = true; return; }
  if (s.state === 'failing') { log('sentry: still down — already failing, no further restarts'); return; }
  if (!s.seenUp && s.lastStart !== null && s.t - s.lastStart < GRACE) { s.state = 'starting'; log('sentry: launched moments ago → starting'); return; }
  const cooled = s.lastRestart === null || s.t - s.lastRestart >= COOLDOWN;
  if (s.restarts >= 1 || !cooled) { s.state = 'failing'; log(`sentry: down — ${s.restarts >= 1 ? 'the restart did not bring it back' : 'down again within the cooldown'} → FAILING (red badge)`); return; }
  s.restarts = 1; s.lastRestart = s.t; s.state = 'starting';
  launch('sentry: down → ONE restart attempt');
}

function render() {
  $('states').innerHTML = STATES.map((x, i) => `${i ? '<span class="arrow">·</span>' : ''}<span class="st${s.state === x ? ' on' : ''}" data-s="${x}">${x}</span>`).join('');
  $('kv').innerHTML = `<span>restart attempts since up: <b>${s.restarts}</b></span><span>start command: <b>${s.broken ? 'broken' : 'ok'}</b></span><span>app answering: <b>${s.answers ? 'yes' : 'no'}</b></span><span>grace ${GRACE} min · cooldown ${COOLDOWN} min</span>`;
}

$('b-boot').onclick = () => { log('harness started → boot pass'); apply('boot'); render(); };
$('b-comesup').onclick = () => { s.answers = !s.broken; log(s.broken ? 'cannot answer: the command is broken' : 'the app answers now'); render(); };
$('b-crash').onclick = () => { s.answers = false; s.answersSoon = false; log('💥 the app died'); render(); };
$('b-broken').onclick = () => { s.broken = !s.broken; if (s.broken) { s.answers = false; s.answersSoon = false; } log(`start command ${s.broken ? 'broken' : 'fixed'}`); render(); };
$('b-time').onclick = () => { pass(); render(); };
$('b-apply').onclick = () => { log('Operator: Apply now (clears failing)'); apply('apply-now'); render(); };
$('b-reset').onclick = reset;
reset();
