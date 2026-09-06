// Goal conversations, the simple model: the arch on a timer; passive agents. A sped-up
// simulation — one real minute is ~1.5 s here. Build-less, relative only.
(function () {
  const FLOOR = 5; // minutes
  const SPEED = 1500; // ms per simulated minute
  let t = 0, running = null, sim = null, ended = false, prgTask = null, fluentTask = null, polls = 0;
  const $ = (id) => document.getElementById(id);
  const drop = (id, text, cls) => {
    const box = $(id); const el = document.createElement('div');
    el.className = 'ev ' + (cls || ''); el.textContent = text; box.prepend(el);
    while (box.children.length > 6) box.removeChild(box.lastChild);
  };
  const setState = (who, s) => { $('st-' + who).textContent = s; $('ag-' + who).className = 'agent ' + (s === 'running' ? 'is-running' : s === 'finished' ? 'is-finished' : ''); };
  function paint() {
    const left = Math.max(0, FLOOR - (t % FLOOR));
    $('bar').style.width = ((t % FLOOR) / FLOOR * 100) + '%';
    $('clock').textContent = ended ? 'goal ended' : `next poll in ${Math.floor(left)}:${String(Math.round((left % 1) * 60)).padStart(2, '0')}`;
  }
  function poll() {
    if (ended) return;
    polls += 1;
    drop('drop-goal', `poll #${polls}: goal re-sent → arch checks list_agents / read_transcript / list_tasks`, 'wake');
    if (prgTask === 'finished') { drop('drop-goal', 'read_transcript(prg): "TASK DONE" → card moved, next task sent to prg', ''); setState('prg', 'running'); prgTask = 'running'; }
    else if (prgTask === null) { drop('drop-goal', 'send_task(prg, "open the PR for task 1")', ''); setState('prg', 'running'); prgTask = 'running'; }
    else drop('drop-goal', 'prg still running → nothing to do', 'nothing');
    if (fluentTask === null) { drop('drop-goal', 'send_task(fluent, "fix the build")', ''); setState('fluent', 'running'); fluentTask = 'running'; }
    else if (fluentTask === 'finished') { drop('drop-goal', 'read_transcript(fluent): "TASK DONE" → card moved', ''); setState('fluent', 'idle'); fluentTask = 'done'; }
    drop('drop-default', 'nothing — your chat is untouched', 'nothing');
  }
  function tick() {
    t += 0.5;
    // agents finish on their own schedule; nothing happens until the next poll
    if (prgTask === 'running' && Math.random() < 0.12) { prgTask = 'finished'; setState('prg', 'finished'); drop('drop-goal', 'prg finished — but nobody is told; it waits for the next poll', 'nothing'); }
    if (fluentTask === 'running' && Math.random() < 0.10) { fluentTask = 'finished'; setState('fluent', 'finished'); drop('drop-goal', 'fluent finished — waits for the next poll', 'nothing'); }
    if (t % FLOOR === 0) poll();
    paint();
  }
  function finish() {
    if (ended) return;
    ended = true; clearInterval(sim); sim = null;
    drop('drop-goal', 'arch: LOOP_DONE → harness: verify → arch: GOAL_VERIFIED', 'wake');
    drop('drop-goal', 'goal done: prg, fluent released; conversation free', '');
    $('busy').textContent = 'free · goal g1 done'; $('busy').className = 'pill free';
    setState('prg', 'idle'); setState('fluent', 'idle');
    drop('drop-default', 'goal g1 done — summary: what was achieved, what needs you (actor: goal)', 'wake');
    paint();
  }
  $('play').addEventListener('click', () => {
    if (ended) return;
    if (sim) { clearInterval(sim); sim = null; $('play').textContent = '▶ play'; return; }
    if (polls === 0) poll();
    sim = setInterval(tick, SPEED / 2); $('play').textContent = '⏸ pause';
  });
  $('poll').addEventListener('click', () => { if (!ended) { t = Math.ceil(t / FLOOR) * FLOOR; poll(); paint(); } });
  $('finish').addEventListener('click', finish);
  $('reset').addEventListener('click', () => {
    clearInterval(sim); sim = null; t = 0; ended = false; prgTask = null; fluentTask = null; polls = 0;
    $('drop-goal').innerHTML = ''; $('drop-default').innerHTML = '<div class="ev nothing">nothing arrives here on its own</div>';
    $('busy').textContent = 'busy: goal g1'; $('busy').className = 'pill busy'; $('play').textContent = '▶ play';
    setState('prg', 'idle'); setState('fluent', 'idle'); paint();
  });
  paint();
})();
