// Understanding app (openspec repo-agent-subagents): tabs, the clickable "today" diagram,
// the animated life of a subagent, and the tables. Build-less, relative URLs only.
(function () {
  const D = window.UNDERSTANDING;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- tabs --------------------------------------------------------------------------------
  const tabs = document.querySelectorAll('#tabs button');
  const views = document.querySelectorAll('.view');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('on', x === b));
    views.forEach((v) => v.classList.toggle('on', v.id === 'view-' + b.dataset.view));
    if (b.dataset.view === 'flow') show(step);
  }));

  // ---- today: the diagram + facts ------------------------------------------------------------
  const diag = $('#today-diagram');
  D.todayDiagram.forEach((n, i) => {
    if (i > 0) diag.appendChild(el('span', 'arrow', '→'));
    const b = el('div', 'dnode', n.label);
    b.addEventListener('click', () => {
      diag.querySelectorAll('.dnode').forEach((x) => x.classList.toggle('now', x === b));
      $('#today-text').innerHTML = '<b>' + n.label + '</b> — ' + n.text;
    });
    diag.appendChild(b);
  });
  D.todayFacts.forEach((t) => $('#today-facts').appendChild(el('li', null, t)));
  D.todayRepo.forEach((t) => $('#today-repo').appendChild(el('li', null, t)));

  // ---- tables ------------------------------------------------------------------------------
  const table = (id, rows) => {
    const t = $(id);
    rows.forEach((r, i) => {
      const tr = el('tr');
      r.forEach((c) => tr.appendChild(el(i === 0 ? 'th' : 'td', null, c)));
      t.appendChild(tr);
    });
  };
  table('#general-table', D.generalTable);
  table('#rules-table', D.rules);
  table('#risks-table', D.risks);
  D.generalBackend.forEach((t) => $('#general-backend').appendChild(el('li', null, t)));
  D.generalUi.forEach((t) => $('#general-ui').appendChild(el('li', null, t)));
  D.plan.forEach((t) => $('#plan-steps').appendChild(el('li', null, t)));
  D.questions.forEach((t) => $('#plan-questions').appendChild(el('li', null, t)));

  // ---- the flow --------------------------------------------------------------------------
  const boxes = [...document.querySelectorAll('.box[data-step]')];
  const stepText = $('#stepText');
  const stepLabel = $('#stepLabel');
  let step = 0, timer = null;
  function show(i) {
    step = Math.max(0, Math.min(D.flow.length - 1, i));
    boxes.forEach((b) => {
      const s = Number(b.dataset.step);
      b.classList.toggle('now', s === step);
      b.classList.toggle('past', s < step);
    });
    const [who, text] = D.flow[step];
    stepText.innerHTML = '<b>' + who + '</b> — ' + text;
    stepLabel.textContent = 'step ' + (step + 1) + ' of ' + D.flow.length;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; $('#play').textContent = '▶ Play'; } }
  $('#next').addEventListener('click', () => { stop(); show(step + 1); });
  $('#prev').addEventListener('click', () => { stop(); show(step - 1); });
  $('#play').addEventListener('click', () => {
    if (timer) return stop();
    if (step >= D.flow.length - 1) show(0);
    $('#play').textContent = '⏸ Pause';
    timer = setInterval(() => { if (step >= D.flow.length - 1) stop(); else show(step + 1); }, 3000);
  });
  show(0);
})();
