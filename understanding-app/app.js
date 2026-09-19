// Understanding app — three more harness tools for every repo agent (openspec repo-agent-harness-tools).
// Build-less, relative URLs only (docs/understanding-app-convention.md).
(function () {
  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('is-on', x === b));
    views.forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
  }));

  const EX = {
    help: {
      call: 'harness_help({ query: "how do I update the understanding app" })',
      answer: JSON.stringify({
        ok: true, status: 'found', source: 'live', file: 'docs/understanding-app-convention.md',
        forThisRepo: { repo: 'prg', path: 'C:\\Users\\…\\playground\\prg', entry: 'C:\\Users\\…\\playground\\prg\\understanding-app\\index.html', servedAt: '/api/localview/prg/app/understanding/' },
        topic: { id: 'understanding-app-convention', title: 'The Understanding-app convention', sections: ['what-to-do', 'the-four-line-contract', 'no-fallback', 'the-goal-app'] },
        text: '# The Understanding-app convention\n…\n## The four-line contract\n1. Build-less & self-contained …\n2. Relative URLs only …\n3. Overwrite the rolling-latest entry …\n4. Let the harness serve it …',
      }, null, 1),
      effects: [
        'no arguments → the index: every docs/*.md of the harness as a topic, with its sections',
        'topic: "understanding-app-convention#the-four-line-contract" → just that section',
        'the text is read from the harness checkout on this call — a doc edited on main answers differently tomorrow',
        'the prefix is computed from THIS agent\u2019s repo: name, path, Local-tab URL',
      ],
    },
    stash: {
      call: 'stash_prompt({ text: "Task 2 of 5: add the Settings tab …" })',
      answer: JSON.stringify({
        ok: true, status: 'stashed', detail: 'queued as #2 of 2 on your dock tab "prg"; a queue loop drains the head first',
        data: { tabId: '4f1c…', position: 2, count: 2, queue: [{ id: 'a1…', text: 'Task 1 of 5: …' }, { id: 'b2…', text: 'Task 2 of 5: …' }] },
      }, null, 1),
      effects: [
        'the same store the dock and the queue loop use (DockRegistry.AddStash) — the item appears in the dock\u2019s stash at once',
        'the tab is the agent\u2019s own: the tab of its running session → the repo\u2019s dashboard tab → its newest tab; none → refused',
        'first: true puts the prompt at the head (ReorderStash)',
        'add only — the Operator curates; the agent never removes or edits items',
      ],
    },
    loop: {
      call: 'arm_my_loop({ kind: "queue", mode: "drive", maxIterations: 10 })',
      answer: JSON.stringify({
        ok: true, status: 'armed', detail: 'queue loop armed on prg (drive, cap 10); loopId r-prg — the Operator sees it on the dock\u2019s Loop panel as armed by agent',
        data: { loopId: 'r-prg', kind: 'queue', mode: 'drive', state: 'armed', cap: 10, iterationsDone: 0, createdBy: 'agent', queue: { tabId: '4f1c…', remaining: 2, verifyEnabled: true }, pacing: 'drive: sends when the agent is idle after each turn (engine tick ≤ 10 s), up to the cap; one stashed prompt per turn' },
      }, null, 1),
      effects: [
        'the arch\u2019s arming path, extracted into LoopArmer — same validation, same store calls, same session pin, same audit',
        'gate closed → not-accepting, nothing changed (status still answers)',
        'a queue arm resolves the agent\u2019s own tab and refuses an empty stash: stash_prompt first',
        'a drive loop fires only when the agent is idle — arming it mid-turn is fine, the engine waits',
      ],
    },
  };
  const call = document.getElementById('call');
  const answer = document.getElementById('answer');
  const effects = document.getElementById('effects');
  function show(k) {
    const e = EX[k];
    call.textContent = e.call;
    answer.textContent = e.answer;
    effects.innerHTML = '';
    e.effects.forEach((t) => { const li = document.createElement('li'); li.textContent = t; effects.appendChild(li); });
  }
  document.querySelectorAll('input[name="tool"]').forEach((r) => r.addEventListener('change', () => show(r.value)));
  show('help');

  const TOPICS = [
    ['understanding-app-convention', 'what the Understanding app is, the four-line contract, how THIS repo updates understanding-app/index.html; the Goal app section'],
    ['local-exposure-convention', 'exposing a real product on the Local tab: dual-stack bind, serve at root, relative URLs, the proxy path'],
    ['global-exposure-convention', 'the global (off-box) exposure contract'],
    ['loop-driven-agent-convention', 'the markers a loop-driven agent must end with: LOOP_DONE, NEEDS_HUMAN:, FLAG:, GOAL_VERIFIED, STEP_VERIFIED'],
    ['loop-drafts-convention', 'how loop drafts are captured and filled'],
    ['detached-verification-convention', 'verifications that outlive the session: detached launch, log file + terminal marker'],
    ['agents', 'the agent concept map: Repo Agent, Management Agent, Arch, Tasks Agent, Dock, Fleet, Harness tools'],
    ['networking', 'how the homepage / App tab / Local tab are served, the gates, the "won\u2019t serve" decision tree'],
    ['event-feed-contract', 'the harness event feed'],
    ['providers', 'the agent providers (Claude, Codex) and their parity'],
    ['claude-in-chrome', 'the browser-mode turns'],
  ];
  const tb = document.getElementById('topics');
  TOPICS.forEach(([id, what]) => { const tr = document.createElement('tr'); tr.innerHTML = '<td><code>' + id + '</code></td><td>' + what + '</td>'; tb.appendChild(tr); });
})();
