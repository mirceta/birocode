// The live demo (openspec repo-agent-subagents): replays the REAL run's events (demo.js) on a
// clock — the parent's dock, the Subagents lane with its stepper, the run slots, the engine, and
// the transcript folder(s) with the "newest file" pointer that several harness paths trust.
// Also fills the Claude Monitor assessment tab. Build-less; relative URLs only.
(function () {
  const D = window.DEMO;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.textContent = html; return e; };
  const end = D.end + 2;

  // run-slot intervals, from the event times
  const ev = D.events;
  const tOf = (pred) => (ev.find(pred) || {}).t;
  const parentBusy = [[0, tOf((e) => e.who === 'parent' && e.kind === 'reply')], [tOf((e) => e.kind === 'summary') - 0.5, D.end]];
  const subReplies = ev.filter((e) => e.who === 'sub' && e.kind === 'reply').map((e) => e.t);
  const subBusy = [[tOf((e) => e.who === 'harness' && /slot free/.test(e.text)), subReplies[0]], [tOf((e) => e.who === 'harness' && /LOOP_DONE/.test(e.text)), subReplies[1]]];
  const inside = (t, spans) => spans.some(([a, b]) => t >= a && t < b);
  // the two transcripts' last-write times
  const parentWrites = ev.filter((e) => e.who === 'parent').map((e) => e.t);
  const subWrites = ev.filter((e) => e.who === 'sub').map((e) => e.t);
  const lastWrite = (writes, t) => { let w = null; for (const x of writes) if (x <= t) w = x; return w; };

  // ---- rendering ----------------------------------------------------------------------------
  const parentBox = $('#d-parent'), subBox = $('#d-sub'), engineBox = $('#d-engine');
  let shown = 0;
  let model = 'today';
  function resetView() {
    parentBox.innerHTML = ''; subBox.innerHTML = ''; engineBox.innerHTML = ''; shown = 0;
    const ol = $('#d-steps'); ol.innerHTML = '';
    D.plan.forEach((s) => ol.appendChild(el('li', null, s)));
  }
  function bubble(e) {
    const b = el('div', `b ${e.kind}`, e.text);
    if (e.who === 'parent') { parentBox.appendChild(b); parentBox.scrollTop = 1e9; }
    else if (e.who === 'sub') { subBox.appendChild(b); subBox.scrollTop = 1e9; }
    else { engineBox.appendChild(el('li', null, `+${e.t.toFixed(1)} s  ${e.text}`)); }
    if (e.kind === 'summary' || (e.who === 'parent' && e.kind === 'tool' && /start_subagent/.test(e.text))) {
      const lane = $('#d-lane'); lane.classList.add('flash'); setTimeout(() => lane.classList.remove('flash'), 1500);
    }
  }
  function render(t) {
    // events up to t (rebuild when scrubbing back)
    const due = ev.filter((e) => e.t <= t).length;
    if (due < shown) resetView();
    while (shown < due) bubble(ev[shown++]);
    $('#d-clock').textContent = `+${t.toFixed(1)} s / ${end.toFixed(0)} s`;
    $('#d-scrub').value = Math.round((t / end) * 1000);
    // slots
    const pb = inside(t, parentBusy), sb = inside(t, subBusy);
    const slot = (id, busy, text) => { const s = $(id); s.classList.toggle('busy', busy); s.querySelector('b').textContent = text; };
    slot('#slot-parent', pb, pb ? 'busy' : 'free');
    slot('#slot-sub', sb, sb ? 'busy' : t < D.start ? '—' : 'free');
    slot('#slot-lock', pb || sb, pb ? 'the parent' : sb ? 'the subagent (the parent waits)' : 'nobody');
    // the Subagents lane
    const started = t >= D.start;
    const verified = t >= tOf((e) => e.who === 'harness' && /GOAL_VERIFIED/.test(e.text));
    const done = D.marks.filter((m) => m <= t).length;
    [...$('#d-steps').children].forEach((li, i) => li.classList.toggle('done', i < done));
    $('#d-row').style.opacity = started ? 1 : 0.25;
    const dot = $('#d-dot');
    dot.className = 'dot ' + (!started ? '' : verified ? 'idle' : sb ? 'running' : 'free');
    $('#d-state').textContent = !started ? '—' : verified ? 'done' : sb ? 'busy' : 'polling';
    $('#d-prog').textContent = started ? `${done}/3 steps` : '';
    $('#d-badge').textContent = started && !verified ? '1' : '';
    folders(t);
  }

  // ---- the transcript folder(s) ------------------------------------------------------------
  function folders(t) {
    const pw = lastWrite(parentWrites, t), sw = lastWrite(subWrites, t);
    const host = $('#d-folders'); host.innerHTML = '';
    const file = (name, who, at, newest) => {
      const f = el('div', `file${newest ? ' newest' : ''}`);
      f.appendChild(el('span', null, `${name}….jsonl`));
      f.appendChild(el('span', 'who', who));
      f.appendChild(el('span', 'dim', `written +${at.toFixed(1)} s`));
      if (newest) f.appendChild(el('span', 'tag', '← NEWEST'));
      return f;
    };
    const warn = $('#d-warn');
    if (model === 'today') {
      const box = el('div', 'folder');
      box.appendChild(el('div', 'path', '~/.claude/projects/C--Users-…-Temp-subagent-e2e-b68f1480/   (ONE folder: the checkout\'s path, encoded)'));
      const newest = sw != null && (pw == null || sw > pw) ? 'sub' : 'parent';
      if (pw != null) box.appendChild(file(D.parentFile, 'parent', pw, newest === 'parent'));
      if (sw != null) box.appendChild(file(D.subFile, 'subagent', sw, newest === 'sub'));
      host.appendChild(box);
      if (sw != null && newest === 'sub') {
        warn.className = 'warn bad';
        warn.textContent = 'Right now the NEWEST transcript in the parent\'s folder is the SUBAGENT\'s. Every harness path that picks "the newest transcript" for the parent would land in the subagent\'s conversation: the suggestion loop (it judges and resumes the newest session), a loop armed from the dock or by arm_my_loop with no session, the arch\'s read_transcript / send fallback, and the dock\'s conversation picker lists it as one of the parent\'s. Running the CLI through Claude Monitor writes into this same folder.';
      } else {
        warn.className = 'warn ok';
        warn.textContent = sw == null ? 'Only the parent\'s conversation exists so far.' : 'The parent wrote last, so "newest" happens to be right — by timing, not by design.';
      }
    } else {
      const wrap = el('div', 'folders');
      const a = el('div', 'folder'); a.appendChild(el('div', 'path', '~/.claude/projects/C--…-subagent-e2e-b68f1480/   (the parent\'s checkout)'));
      if (pw != null) a.appendChild(file(D.parentFile, 'parent', pw, true));
      const b = el('div', 'folder'); b.appendChild(el('div', 'path', '~/.claude/projects/C--…-subagent-e2e-b68f1480-subagents-98f9fb50/   (a git worktree on branch subagent/98f9fb50)'));
      if (sw != null) b.appendChild(file(D.subFile, 'subagent', sw, true));
      wrap.appendChild(a); wrap.appendChild(b); host.appendChild(wrap);
      warn.className = 'warn ok';
      warn.textContent = 'Separate working directory ⇒ separate transcript folder: "newest" in the parent\'s folder is always the parent\'s; the subagent edits its own tree on its own branch, so no one-writer lock is needed and the parent is never blocked. The parent merges (or cherry-picks) the subagent\'s branch when the summary arrives.';
    }
  }
  document.querySelectorAll('input[name=fold]').forEach((r) => r.addEventListener('change', () => { model = r.value; folders(clock); }));

  // ---- the clock -----------------------------------------------------------------------------
  let clock = 0, timer = null, last = 0;
  const speed = () => Number($('#d-speed').value) || 1;
  function tick(now) {
    if (!timer) return;
    const dt = (now - last) / 1000; last = now;
    clock = Math.min(end, clock + dt * speed());
    render(clock);
    if (clock >= end) { stop(); return; }
    timer = requestAnimationFrame(tick);
  }
  function stop() { if (timer) cancelAnimationFrame(timer); timer = null; $('#d-play').textContent = '▶ Play'; }
  $('#d-play').addEventListener('click', () => {
    if (timer) return stop();
    if (clock >= end) { clock = 0; resetView(); }
    $('#d-play').textContent = '⏸ Pause';
    last = performance.now();
    timer = requestAnimationFrame(tick);
  });
  $('#d-restart').addEventListener('click', () => { stop(); clock = 0; resetView(); render(0); });
  $('#d-scrub').addEventListener('input', (e) => { stop(); clock = (Number(e.target.value) / 1000) * end; render(clock); });
  resetView();
  render(0);

  // ---- the Claude Monitor assessment -----------------------------------------------------------
  const M = window.MONITOR;
  const t = $('#monitor-table');
  M.table.forEach((r, i) => { const tr = el('tr'); r.forEach((c) => { const td = el(i === 0 ? 'th' : 'td'); td.innerHTML = c; tr.appendChild(td); }); t.appendChild(tr); });
  M.why.forEach((x) => { const li = el('li'); li.innerHTML = x; $('#monitor-why').appendChild(li); });
  M.fix.forEach((x) => { const li = el('li'); li.innerHTML = x; $('#monitor-fix').appendChild(li); });
})();
