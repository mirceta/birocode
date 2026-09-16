// Understanding app — Kanban policeman (openspec kanban-board-integrity). No deps.
(function () {
  // Tabs
  var tabs = document.querySelectorAll('.tab');
  var views = document.querySelectorAll('.view');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('is-on', x === t); });
      views.forEach(function (v) { v.classList.toggle('is-on', v.dataset.view === t.dataset.view); });
    });
  });

  // The pass, animated
  var steps = document.querySelectorAll('#flow .step');
  document.getElementById('play').addEventListener('click', function () {
    var i = 0;
    steps.forEach(function (s) { s.classList.remove('is-hot'); });
    var id = setInterval(function () {
      steps.forEach(function (s, k) { s.classList.toggle('is-hot', k === i); });
      i++;
      if (i >= steps.length) { clearInterval(id); setTimeout(function () { steps.forEach(function (s) { s.classList.remove('is-hot'); }); }, 900); }
    }, 700);
  });

  // The judgement — the same rules as BoardIntegrity.Judge, on a few sample cards.
  var RANK = { todo: 0, doing: 1, committed: 2, 'pr-opened': 3, 'pr-merged': 4, done: 5 };
  var WINDOW_H = 24;
  function judge(c) {
    if (c.manual) return { state: 'manual', reason: 'manual — the Operator handles it directly; not policed' };
    var ceiling = Math.max(RANK.doing, RANK[c.verified || 'todo']);
    if (RANK[c.status] > ceiling) return { state: 'dishonest', reason: 'column ahead of reality — claimed ' + c.status + ', verified: ' + (c.verified || 'nothing') };
    if (c.status === 'pr-merged' || c.status === 'done') return { state: 'honest', reason: 'delivered' };
    if (!c.pinged) return { state: 'honest', reason: 'never pinged — nothing to be stuck on' };
    if (c.pr) return { state: 'honest', reason: 'a PR exists — it waits on review, not on the assignee (that is the stale flag\'s job)' };
    if (c.status === 'todo' && /\bBLOCKED\b/i.test(c.note || '')) return { state: 'stuck', reason: 'the assignee reported it is blocked: ' + c.note.split('\n')[0] };
    if ((c.status === 'doing' || c.status === 'committed') && c.silentH > WINDOW_H) return { state: 'stuck', reason: 'pinged, no PR and no progress for ' + c.silentH + ' h (window ' + WINDOW_H + ' h)' };
    return { state: 'honest', reason: 'consistent with the facts' };
  }
  var samples = [
    { title: 'Kanban policeman', status: 'doing', verified: 'doing', pinged: true, silentH: 1, facts: 'doing · verified doing · pinged 1 h ago' },
    { title: 'Fleet keep-alive column', status: 'pr-opened', verified: null, pinged: true, silentH: 3, facts: 'pr-opened · verified nothing · pinged 3 h ago' },
    { title: 'Export the invoice register', status: 'doing', verified: 'doing', pinged: true, silentH: 30, facts: 'doing · no PR · silent 30 h' },
    { title: 'Rotate the API key', status: 'todo', verified: null, pinged: true, silentH: 1, note: 'TASK BLOCKED: needs the production credential', facts: 'todo · note "TASK BLOCKED: …"' },
    { title: 'Release notes 2.4', status: 'doing', verified: 'doing', pinged: true, silentH: 60, pr: true, facts: 'doing · PR #12 open · silent 60 h' },
    { title: 'Handled by hand', status: 'pr-merged', verified: null, pinged: true, silentH: 100, manual: true, facts: 'manual · pr-merged · verified nothing' },
  ];
  var cards = document.getElementById('cards');
  var verdict = document.getElementById('verdict');
  function show(i) {
    var c = samples[i]; var v = judge(c);
    Array.prototype.forEach.call(cards.children, function (el, k) { el.classList.toggle('is-on', k === i); });
    verdict.className = 'verdict ' + v.state;
    verdict.innerHTML = '<b>' + v.state + '</b> — ' + v.reason + (v.state === 'stuck' ? ' → stamped 🆘 <i>human assistance requested</i> (by the policeman)' : v.state === 'dishonest' ? ' → 👮 chip + amber edge; the ⚠ warning stays' : '');
  }
  samples.forEach(function (c, i) {
    var el = document.createElement('div'); el.className = 'card';
    el.innerHTML = '<div class="title">' + c.title + '</div><div class="facts">' + c.facts + '</div>';
    el.addEventListener('click', function () { show(i); });
    cards.appendChild(el);
  });
  show(2);

  // Go manual
  var hands = document.getElementById('hands');
  document.getElementById('manual').addEventListener('change', function (e) { hands.classList.toggle('is-manual', e.target.checked); });
})();
