// Understanding app: the Tasks agent flow (openspec tasks-agent). Build-less,
// relative URLs only — served by the harness under /api/localview/<repo>/app/understanding/.
(function () {
  const STAGES = [
    {
      icon: '💡', name: 'Ideas composer', where: 'client/src/components/ideas/IdeasPanel.jsx',
      log: 'POST /api/tasks/send { text: "Break the following into tasks…\\n\\n<draft>" }',
      body: `
<p>The operator pastes a long prompt into the Ideas composer and clicks <b>🗂 Break into tasks</b> (Advanced mode, feature <code>ideasBreakUp</code>).</p>
<ul>
  <li>The draft is wrapped in one instruction line and posted to <code>/api/tasks/send</code>.</li>
  <li>On success the draft is cleared, the panel switches to the <b>Task graph</b> section and shows "The Tasks agent is working…".</li>
  <li>On a 409 (the agent is mid-turn) the panel shows the reason and the draft stays put.</li>
  <li>The panel then polls <code>GET /api/tasks</code> every 2 s until <code>session.run.status</code> is no longer <code>running</code>, bumps <code>refreshKey</code> on <code>TaskGraphPanel</code>, and the board reloads — no page refresh.</li>
</ul>`,
    },
    {
      icon: '🗂', name: 'Tasks agent turn', where: 'Services/Tasks/TasksAgentService.cs · TasksController.cs',
      log: 'claude -p … --mcp-config {tasks: http://127.0.0.1:5099/api/tasks/mcp, Bearer <token>} --disallowedTools …',
      body: `
<p><code>TasksAgentService.Send</code> takes the <code>@tasks</code> run slot (409 if busy), ensures the home folder, and launches one Claude turn through the same <code>CliRunnerService</code> every chat uses.</p>
<ul>
  <li><b>Home</b>: <code>TasksHomeDir</code> from appsettings, else a <code>tasks-home</code> sibling of the harness repo. It holds <code>CLAUDE.md</code> (the role prompt, versioned <code>tasks-role v1</code>) and <code>.claude/settings.json</code> (the deny fence).</li>
  <li><b>Session</b>: the last completed session id is pinned in <code>tasks-agent.json</code>, so the conversation continues across restarts.</li>
  <li><b>Live view</b>: the run emits <code>user / thinking / tool / token</code> events; the Tasks page and the multiplexed stream hub render them as the turn runs.</li>
</ul>
<p>The role prompt tells it: read the whole message, <code>list_tasks</code> first, create every task (verb-phrase title, definition of done in the note), then link dependencies, then reply with a numbered summary.</p>`,
    },
    {
      icon: '🔌', name: 'Tasks MCP (JSON-RPC)', where: 'Services/Tasks/TasksMcpServer.cs · POST /api/tasks/mcp',
      log: 'tools/call create_task {title:"Add the Tasks MCP server"} → {ok:true,status:"created",data:{id:…}}',
      body: `
<p>The CLI talks MCP over HTTP to the harness itself. The server is stateless: <code>initialize</code>, <code>ping</code>, <code>tools/list</code>, <code>tools/call</code>; notifications get 202; <code>GET</code> is 405.</p>
<ul>
  <li>Every request carries <code>Authorization: Bearer &lt;per-process token&gt;</code>; the controller checks it in constant time and answers 401 otherwise. The password middleware exempts exactly this path.</li>
  <li>Tool results are JSON text: <code>{ ok, status, detail, data }</code>. A refused call (bad id, cycle, empty title) is <code>ok:false</code> and <code>isError:true</code>.</li>
</ul>
<pre>list_ideas · create_idea(text, project?, priority?, active?) · update_idea(id, …partial)
list_tasks · create_task(title, note?, repoId?) · update_task(id, …partial, status?)
link_tasks(source, target)   // source depends on target
delete_task(id)</pre>`,
    },
    {
      icon: '🧠', name: 'Toolbox → services', where: 'Services/Tasks/TasksToolbox.cs → NotesService · TaskGraphService · AutopilotAuditLog',
      log: 'TaskGraphService.AddNode(title, note, repoId, null, x, y) · AddEdge(source, target) → EdgeError.None | Cycle …',
      body: `
<p><code>TasksToolbox</code> is the only thing the MCP server calls. It has no CLI, no HTTP and no runner, so the unit tests build it over temp-dir stores.</p>
<ul>
  <li><b>No second store</b>: it calls the same services the Ideas tab uses, so entries sync, merge and tombstone like typed ones.</li>
  <li><b>Auto-placement</b>: a new node goes on the current bottom row until that row holds four, then a new row starts 140 px lower. A batch lands readable.</li>
  <li><b>Partial updates</b> read the current note/task first, so an omitted field is kept (the REST PATCH overwrites; the tool must not surprise the model).</li>
  <li><b>Cycle safety</b> is inherited: <code>AddEdge</code> refuses <code>MissingNode / SelfLoop / Duplicate / Cycle</code>; the toolbox maps that to status <code>missing-node / self-loop / duplicate / cycle</code>.</li>
  <li><b>Audit</b>: one row per call — kind <code>tasks</code>, outcome <code>tasks-tool</code>, phase = tool name, message = a short summary.</li>
</ul>`,
    },
    {
      icon: '🧩', name: 'Task graph panel', where: 'client/src/components/taskgraph/TaskGraphPanel.jsx · GET /api/taskgraph',
      log: 'refreshKey++ → load() → nodes + edges re-read → new tasks appear, actionable ones highlighted',
      body: `
<p>When the run ends the Ideas panel bumps <code>refreshKey</code>; the board re-reads <code>/api/taskgraph</code> and renders the new nodes and edges where the agent placed them.</p>
<ul>
  <li>Nodes whose dependencies are all done are highlighted as actionable; selecting a node lights the chain it unblocks.</li>
  <li>Positions persist on drag-stop, so the operator can rearrange the agent's rows.</li>
  <li>The same board syncs to other harnesses over the ideas shared-store wire when sync is on.</li>
</ul>
<p>The Tasks page (studio tab <code>/studio/tasks</code>, and the <b>Tasks</b> tab of the Management App the dashboard embeds) shows the conversation and, in its Tools lane, the eight tools with their audit-derived call counts.</p>`,
    },
  ];

  const flow = document.getElementById('flow');
  const title = document.getElementById('detail-title');
  const body = document.getElementById('detail-body');
  const playBtn = document.getElementById('play');
  const resetBtn = document.getElementById('reset');
  const speed = document.getElementById('speed');

  const packet = document.createElement('div');
  packet.className = 'packet packet--hidden';
  packet.textContent = '📨 prompt';
  flow.appendChild(packet);

  const els = STAGES.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'stage';
    el.setAttribute('data-stage', String(i + 1));
    el.innerHTML = `<span class="stage__n">${i + 1}</span><div class="stage__icon">${s.icon}</div>
      <div class="stage__name">${s.name}</div><div class="stage__where">${s.where}</div>
      <div class="stage__log"></div><span class="stage__arrow">➜</span>`;
    el.addEventListener('click', () => select(i));
    flow.appendChild(el);
    return el;
  });

  function select(i) {
    els.forEach((e, j) => e.classList.toggle('stage--on', i === j));
    title.textContent = `${i + 1}. ${STAGES[i].name}`;
    body.innerHTML = STAGES[i].body;
  }

  let timer = null;
  function reset() {
    if (timer) { clearTimeout(timer); timer = null; }
    els.forEach((e) => { e.classList.remove('stage--active', 'stage--done'); e.querySelector('.stage__log').textContent = ''; });
    packet.classList.add('packet--hidden');
    playBtn.disabled = false;
  }

  function play() {
    reset();
    playBtn.disabled = true;
    const ms = [2600, 1700, 1000][Number(speed.value) - 1];
    packet.classList.remove('packet--hidden');
    let i = 0;
    const step = () => {
      if (i > 0) { els[i - 1].classList.remove('stage--active'); els[i - 1].classList.add('stage--done'); }
      if (i >= els.length) { packet.classList.add('packet--hidden'); playBtn.disabled = false; timer = null; return; }
      const r = els[i].getBoundingClientRect(), f = flow.getBoundingClientRect();
      packet.style.left = `${r.left - f.left + 8}px`;
      packet.textContent = ['📨 prompt', '🤖 turn', '🔌 tools/call', '💾 write', '🧩 reload'][i];
      els[i].classList.add('stage--active');
      els[i].querySelector('.stage__log').textContent = STAGES[i].log;
      select(i);
      i += 1;
      timer = setTimeout(step, ms);
    };
    step();
  }

  playBtn.addEventListener('click', play);
  resetBtn.addEventListener('click', reset);

  // ---- the example graph ----------------------------------------------------------
  const nodes = [
    { id: 'a', t: 'Add the Tasks MCP server', x: 40, y: 40, st: 'todo' },
    { id: 'b', t: 'Write the Tasks agent role', x: 280, y: 40, st: 'todo' },
    { id: 'c', t: 'Add the dock / Tasks surface', x: 520, y: 40, st: 'todo' },
    { id: 'd', t: 'Ideas composer button', x: 760, y: 40, st: 'todo' },
    { id: 'e', t: 'Tests for the tool layer', x: 40, y: 180, st: 'todo' },
    { id: 'f', t: 'Understanding app', x: 280, y: 180, st: 'todo' },
  ];
  // source depends on target
  const edges = [['b', 'a'], ['c', 'b'], ['d', 'c'], ['e', 'a'], ['f', 'd']];
  const svg = document.getElementById('graph');
  const W = 200, H = 60;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const deps = Object.fromEntries(nodes.map((n) => [n.id, []]));
  edges.forEach(([s, t]) => deps[s].push(t));
  let html = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5ea0ef"/></marker></defs>`;
  edges.forEach(([s, t]) => {
    const a = byId[s], b = byId[t];
    const x1 = a.x + W / 2, y1 = a.y + (a.y < b.y ? H : a.y > b.y ? 0 : H / 2);
    const x2 = b.x + W / 2, y2 = b.y + (b.y < a.y ? H : b.y > a.y ? 0 : H / 2);
    const sameRow = a.y === b.y;
    const sx = sameRow ? (a.x < b.x ? a.x + W : a.x) : x1, ex = sameRow ? (a.x < b.x ? b.x : b.x + W) : x2;
    const sy = sameRow ? a.y + H / 2 : y1, ey = sameRow ? b.y + H / 2 : y2;
    const c = sameRow ? `M${sx},${sy} L${ex},${ey}` : `M${sx},${sy} C${sx},${(sy + ey) / 2} ${ex},${(sy + ey) / 2} ${ex},${ey}`;
    html += `<path class="edge" d="${c}"/>`;
  });
  nodes.forEach((n) => {
    const actionable = deps[n.id].every((d) => byId[d].st === 'done');
    html += `<g class="node${actionable ? ' actionable' : ''}" transform="translate(${n.x},${n.y})"><rect width="${W}" height="${H}"/>
      <text x="10" y="24">${n.t}</text><text class="st" x="10" y="44">${n.st}${actionable ? ' · actionable' : ''} · id ${n.id}</text></g>`;
  });
  svg.innerHTML = html;

  select(0);
})();
