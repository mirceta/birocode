// Topic — "Fleet vs worktrees" (fleet task aae448bd).
//
// The research question: this harness parallelises work on ONE repository by running
// one checkout + one repo agent per PHYSICAL machine across a fleet, coordinated by the
// arch/harness. The common way is git worktrees + subagents on a single machine. Was
// ours a good idea? This topic rates five approaches on the dimensions that actually
// matter (★ 1–5, one-line justification each), lists pros/cons per approach, and gives
// a verdict — with a weight preset so the total reflects WHOSE situation is being scored
// (this fleet, with real Birokrat/BiroNext/SQL stacks per machine, is not a solo dev
// with a plain repo). Build-less, self-contained, relative URLs only.

(function () {
  var H = window.ClaudeWebHome;

  // ---- the five approaches --------------------------------------------------------
  var APPROACHES = [
    {
      key: 'fleet', glyph: '🖥️🖥️🖥️', name: 'Fleet of computers', you: true,
      sub: 'ours — one checkout + one repo agent per physical machine, coordinated by the harness',
      pros: [
        'Every agent gets a whole machine: its own CPU, RAM, disk and — the point here — its own real Birokrat / BiroNext / SQL Server stack, ports and licences.',
        'A crash, a runaway build or a full disk on one box touches one agent; the rest of the fleet keeps working.',
        'Secrets, licences and customer-like data stay on the box that needs them; a compromised agent sees one machine.',
        'Truly concurrent builds and test runs — five agents finish five test suites in the time of one.',
        'The harness already gives cross-machine dispatch (send_task), a fleet status board, a policeman and a hub-driven upgrade path.',
      ],
      cons: [
        'Every box must be installed, patched, kept on the same build and reachable; a schtasks permission on one box can block the hub upgrade (it did, on this machine).',
        'Idle boxes burn power and space; utilization is whatever the arch keeps busy.',
        'N full clones, N node_modules, N build outputs, N SQL data directories — disk is paid N times.',
        'Coordination is over the LAN with cached describes: seconds, not milliseconds; a peer can be unreachable.',
        'A new machine is a day of setup, not a git command.',
      ],
    },
    {
      key: 'worktrees', glyph: '🌳', name: 'Git worktrees + subagents', you: false,
      sub: 'the common way — one machine, one object store, one working directory per agent',
      pros: [
        'One command, seconds to create; Claude Code creates and sweeps them for subagents by itself (isolation: worktree).',
        'Shared object store: the cheapest possible disk footprint per extra agent.',
        'Zero coordination latency — same filesystem, same process tree, same terminal.',
        'Trivial onboarding: it is git, nothing to install or register.',
        'Cheapest by far: one machine, one licence set, one power bill.',
      ],
      cons: [
        'No runtime isolation: two agents in two worktrees still collide on port 5099, on the same SQL instance, on the same %APPDATA%.',
        'Compute is time-sliced: five agents share one CPU, one RAM budget, one disk queue; builds and test suites serialize in practice.',
        'One real test stack at most — the second agent that needs a fresh Birokrat database has nowhere to put it.',
        'A runaway agent (fork bomb, rm -rf, a hung build) takes the whole machine and every sibling with it.',
        'Every agent sees every secret on the box.',
      ],
    },
    {
      key: 'clones', glyph: '📁📁', name: 'Multiple clones, one box', you: false,
      sub: 'separate full clones side by side on a single machine',
      pros: [
        'Full directory isolation — no shared .git, no worktree-lock surprises, tooling that dislikes worktrees just works.',
        'Still one machine: no network, no peer registry, instant coordination.',
        'Simple mental model for people who have never met a worktree.',
      ],
      cons: [
        'Duplicates the whole object store per clone — the disk cost of the fleet with none of its compute.',
        'Exactly the worktree runtime problems: shared ports, shared services, shared CPU, shared blast radius.',
        'Keeping N clones on the same base is manual (N fetches, N pulls).',
      ],
    },
    {
      key: 'containers', glyph: '📦', name: 'Containers / VMs, one box', you: false,
      sub: 'one sandbox per agent, each with its own namespaced services',
      pros: [
        'Real runtime isolation on one machine: own ports, own filesystem view, own SQL container per agent; micro-VMs boot in under a second in 2026.',
        'Snapshot / restore: a fresh test database per run without reinstalling anything.',
        'Bounded blast radius without buying hardware; secrets can be injected per sandbox.',
        'Containers pack 5–10× denser than VMs for the same SQL workloads (one 8-core / 96 GB host reported 20 SQL containers).',
      ],
      cons: [
        'Still one physical CPU and RAM budget — density, not parallel compute.',
        'Windows-hosted product stacks (Birokrat, WinForms harness, MSSQL on Windows) containerize badly or not at all; Linux containers cannot run them.',
        'A real image pipeline to maintain: base images, service wiring, licences inside images.',
        'Debugging through a sandbox boundary is slower than on bare metal.',
      ],
    },
    {
      key: 'cloud', glyph: '☁️', name: 'Cloud dev environments', you: false,
      sub: 'Codespaces / remote sandboxes — one environment per agent, billed per core-hour',
      pros: [
        'Elastic: 1 or 50 agents, no hardware bought; every environment is identical from a devcontainer.',
        'Real parallel compute across separate hosts, like the fleet, without owning the boxes.',
        'Strong isolation and central secrets management out of the box.',
        'Nothing to install locally; onboarding is a link.',
      ],
      cons: [
        'Metered: $0.18 per core-hour plus $0.07 per GB-month, and stopped environments keep billing storage — a 4-core box left running is $0.72 an hour.',
        'Your product stack must be reproducible as an image; a Windows-only SQL/WinForms stack is not, so the tests that matter here cannot run there.',
        'Every request leaves the LAN; latency, egress and data residency all bite.',
        'You do not own the machine: no GPU you chose, no license-bound local software, no physical device access.',
      ],
    },
  ];

  // ---- the dimensions, with a weight per preset and a ★ + one line per approach -----
  // Weights: this fleet (real stacks per machine, Windows-only product, LAN, Operator
  // owns the hardware) · solo dev with a plain repo (no service stack, one laptop) ·
  // equal. Ratings are 1–5; r = { fleet, worktrees, clones, containers, cloud }.
  var DIMENSIONS = [
    { key: 'compute', name: 'True parallel compute', w: { fleet: 3, solo: 1, equal: 1 },
      why: 'Do N agents really run N builds and N test suites at once?',
      r: { fleet: [5, 'N machines, N CPUs, N disks — nothing is time-sliced.'],
           worktrees: [2, 'One CPU, one RAM budget; five agents share it and builds queue.'],
           clones: [2, 'Same box as worktrees: the clones share one CPU and one disk queue.'],
           containers: [2, 'Density on one host, not extra compute; the CPU is still one.'],
           cloud: [5, 'Separate hosts per environment, as parallel as the fleet.'] } },
    { key: 'isolation', name: 'Runtime isolation', w: { fleet: 3, solo: 1, equal: 1 },
      why: 'Ports, services, files, environment — can two agents collide?',
      r: { fleet: [5, 'Separate OS, separate everything; collisions are impossible.'],
           worktrees: [1, 'Shared ports, shared services, shared %APPDATA%; only the source tree differs.'],
           clones: [1, 'A second directory is not a boundary: same ports, same services, same user.'],
           containers: [4, 'Namespaced ports and filesystems; the kernel is shared (containers) or not (VMs).'],
           cloud: [5, 'One host per environment, provisioned by the provider.'] } },
    { key: 'testenv', name: 'Test-environment fidelity', w: { fleet: 5, solo: 1, equal: 1 },
      why: 'This fleet needs a REAL Birokrat / BiroNext / SQL Server stack per agent, on Windows.',
      r: { fleet: [5, 'Each machine carries its own installed stack, licences and data — the product runs the way customers run it.'],
           worktrees: [1, 'At most one stack on the box, shared by every agent; the second fresh database has nowhere to live.'],
           clones: [1, 'The same single installed stack, shared by every clone.'],
           containers: [2, 'Great for Linux services; the Windows-only Birokrat/WinForms/MSSQL stack does not containerize here.'],
           cloud: [1, 'A devcontainer cannot host this stack; the tests that matter would not run.'] } },
    { key: 'utilization', name: 'Hardware utilization', w: { fleet: 2, solo: 2, equal: 1 },
      why: 'How much of the bought hardware is doing work?',
      r: { fleet: [2, 'Boxes sit idle whenever the arch has nothing for them; utilization is the scheduler\'s problem.'],
           worktrees: [5, 'One box, always busy while any agent runs.'],
           clones: [5, 'One box, always busy while any agent runs.'],
           containers: [4, 'Dense packing on one host; some overhead per sandbox.'],
           cloud: [4, 'Pay only while running — but agents that loop overnight are never stopped, and storage bills while stopped.'] } },
    { key: 'cost', name: 'Cost', w: { fleet: 2, solo: 3, equal: 1 },
      why: 'Hardware, licences, power, metered compute.',
      r: { fleet: [2, 'N machines, N Windows/SQL licences, N power bills — but bought once and already owned here.'],
           worktrees: [5, 'Free beyond the one machine you already have.'],
           clones: [5, 'Free beyond the one machine, plus the disk for each clone.'],
           containers: [4, 'One host; images and a bit of RAM per sandbox.'],
           cloud: [2, '$0.18/core-hour + $0.07/GB-month, storage billed while stopped; cheap to start, expensive to leave on.'] } },
    { key: 'disk', name: 'Disk footprint', w: { fleet: 1, solo: 2, equal: 1 },
      why: 'Object stores, node_modules, build outputs, database files.',
      r: { fleet: [2, 'Everything N times, on N disks — paid, but never contended.'],
           worktrees: [5, 'One object store; a worktree adds only its working files.'],
           clones: [2, 'Full object store per clone on ONE disk.'],
           containers: [3, 'Layered images share bases; data volumes still add up.'],
           cloud: [3, 'Per-environment storage, metered monthly.'] } },
    { key: 'setup', name: 'Setup & maintenance', w: { fleet: 3, solo: 3, equal: 1 },
      why: 'Getting an agent slot to exist and keeping it current.',
      r: { fleet: [1, 'Install, register, keep on the same build; the hub upgrade failed on this box because schtasks was denied — real overhead, seen this week.'],
           worktrees: [5, 'git worktree add; Claude Code sweeps them itself.'],
           clones: [4, 'git clone, then N pulls to keep in step.'],
           containers: [2, 'Image pipeline, service wiring, licence handling inside images.'],
           cloud: [3, 'A devcontainer.json; the provider runs the rest.'] } },
    { key: 'git', name: 'Git coordination & merge', w: { fleet: 2, solo: 2, equal: 1 },
      why: 'Branches, conflicts, keeping every slot on the same base.',
      r: { fleet: [3, 'One branch per agent, PRs into main, the policeman verifies merges; the committed Management bundle conflicts on nearly every merge.'],
           worktrees: [3, 'Same branch-per-agent shape; the shared store makes rebasing cheap, the conflicts are identical.'],
           clones: [3, 'Same shape, more manual fetching.'],
           containers: [3, 'Same branch-per-agent shape; the sandbox changes nothing about git.'],
           cloud: [3, 'Same branch-per-agent shape; the provider changes nothing about git.'] } },
    { key: 'latency', name: 'Coordination latency', w: { fleet: 1, solo: 1, equal: 1 },
      why: 'How fast does a dispatch, a status read or a hand-over land?',
      r: { fleet: [2, 'LAN peer API with cached describes: seconds, and a peer can be unreachable.'],
           worktrees: [5, 'Same process tree, same filesystem: instant.'],
           clones: [5, 'Same process tree, same filesystem: instant.'],
           containers: [4, 'Loopback to a sandbox; near-instant.'],
           cloud: [2, 'Every call leaves the LAN and comes back through the provider.'] } },
    { key: 'resilience', name: 'Resilience / fault isolation', w: { fleet: 3, solo: 1, equal: 1 },
      why: 'What does one runaway agent, crash or full disk take down?',
      r: { fleet: [5, 'One machine; the fleet status shows it dark and the rest carry on.'],
           worktrees: [1, 'Everything on the box, every sibling agent included.'],
           clones: [1, 'Everything on the box, every sibling clone included.'],
           containers: [4, 'The sandbox; the host survives unless the kernel does not.'],
           cloud: [5, 'One environment dies; the others never notice.'] } },
    { key: 'security', name: 'Secrets & security', w: { fleet: 2, solo: 1, equal: 1 },
      why: 'Blast radius of a compromised or over-eager agent; where credentials live.',
      r: { fleet: [4, 'Per-machine credentials and a LAN allowlist; a bad agent owns one box, not the others.'],
           worktrees: [1, 'Every agent sees every secret, every file, every process on the machine.'],
           clones: [1, 'Every clone sees every secret, every file, every process on the machine.'],
           containers: [4, 'Secrets injected per sandbox; filesystem views separated.'],
           cloud: [3, 'Central secret store and provider-grade isolation — but customer-shaped data leaves your premises.'] } },
    { key: 'observability', name: 'Observability', w: { fleet: 2, solo: 1, equal: 1 },
      why: 'Can you see what every agent is doing, from one place?',
      r: { fleet: [4, 'Fleet Status, per-machine overview, Console lanes and the audit trail — built because the fleet needed them.'],
           worktrees: [2, 'One terminal per session; the harness sees one machine.'],
           clones: [2, 'One terminal per clone; the harness sees one machine.'],
           containers: [3, 'Container logs and metrics, one host.'],
           cloud: [3, 'Provider dashboards; less of your own instrumentation.'] } },
    { key: 'onboarding', name: 'Onboarding', w: { fleet: 1, solo: 2, equal: 1 },
      why: 'How long until a new agent slot (or person) is productive?',
      r: { fleet: [2, 'A new machine is a day: OS, stack, harness, registration, allowlist.'],
           worktrees: [5, 'One git command and the slot exists.'],
           clones: [4, 'A git clone and a build; minutes.'],
           containers: [3, 'Pull the image, if one exists for your stack.'],
           cloud: [5, 'A link; the environment is built from the devcontainer.'] } },
    { key: 'elasticity', name: 'Elastic scaling', w: { fleet: 1, solo: 1, equal: 1 },
      why: 'Going from 3 agents to 30 for an afternoon, and back.',
      r: { fleet: [1, 'You own exactly the boxes you own; a 30th agent means buying and installing a 30th machine.'],
           worktrees: [4, 'Up to the one box\'s limit — reliably 4–8 per developer in practice, then review is the bottleneck.'],
           clones: [3, 'The same one-box limit, with more disk per slot.'],
           containers: [3, 'Up to the host\'s density; RAM per sandbox is the ceiling.'],
           cloud: [5, 'Elastic by design: 1 or 50 environments, billed per core-hour.'] } },
  ];

  var PRESETS = [
    { key: 'fleet', label: '🏢 This fleet', sub: 'real Windows stacks per machine, LAN, owned hardware' },
    { key: 'solo', label: '💻 Solo dev, plain repo', sub: 'one laptop, no service stack, cost matters' },
    { key: 'equal', label: '⚖️ Equal weights', sub: 'every dimension counts once' },
  ];

  var VERDICT = {
    wins: [
      'The agents must run the real product: an installed Birokrat / BiroNext / SQL Server stack per agent, on Windows, with licences and customer-shaped data. Nothing else on this page can give N of those.',
      'Faults must stay local: a hung build, a full disk or a bad agent must not stop the other agents. A fleet member goes dark; the board shows it; work continues.',
      'You already own the machines. The fleet\'s worst dimensions (cost, setup, utilization) are sunk or organisational; its best ones (compute, isolation, fidelity, resilience) are structural.',
      'Long-running, heavy, test-bound work — full test suites, deploys to a live harness, Playwright runs against real services — where time-sliced compute would serialize everything anyway.',
    ],
    loses: [
      'Short, source-only tasks on a plain repo: a rename, a doc, a unit-tested helper. Spinning a machine for that is waste; a worktree costs a second and the machine is already warm.',
      'Bursts beyond the fleet: 20 parallel explorations of one question for an hour. Worktrees on the biggest box (4–8 reliably) or cloud environments scale there; the fleet cannot.',
      'If the product stack ever becomes imageable (Linux services, containerised SQL), cloud environments overtake the fleet on every dimension but cost and latency — revisit this page the day that happens.',
      'When the hub upgrade path is fragile. This week a schtasks permission on one box blocked the fleet upgrade; worktrees have no fleet to upgrade.',
      'Anyone without a second machine, or without the Operator role to run one: the fleet is an organisation\'s pattern, the worktree is an individual\'s.',
    ],
    hybrid: 'The two are not exclusive. Every fleet machine can run worktree subagents for the short, source-only sub-tasks inside a bigger task — Claude Code already sweeps them — while the machine boundary stays the unit for anything that needs the real stack. That keeps the fleet\'s isolation and fidelity where they matter and buys worktree speed where they do not.',
  };

  var SOURCES = [
    ['Claude Code docs — run parallel sessions with worktrees', 'https://code.claude.com/docs/en/worktrees'],
    ['Augment — git worktrees for parallel agent execution', 'https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution'],
    ['Penligent — worktrees need runtime isolation', 'https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/'],
    ['Arcjet — from devcontainers to VMs for parallel agents', 'https://blog.arcjet.com/from-devcontainers-to-vms-parallel-dev-environments-for-ai-agents/'],
    ['Zed — container-use for sandboxed background agents', 'https://zed.dev/blog/container-use-background-agents'],
    ['SQLServerCentral — SQL Server containers (density figures)', 'https://www.sqlservercentral.com/articles/an-introduction-to-sql-server-containers'],
    ['GitHub Codespaces billing (community discussion)', 'https://github.com/orgs/community/discussions/181042'],
    ['GitHub pricing', 'https://github.com/pricing'],
  ];

  // ---- helpers ------------------------------------------------------------------------
  function stars(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function totals(presetKey) {
    var out = {}, wsum = 0;
    APPROACHES.forEach(function (a) { out[a.key] = 0; });
    DIMENSIONS.forEach(function (d) {
      var w = d.w[presetKey];
      wsum += w;
      APPROACHES.forEach(function (a) { out[a.key] += d.r[a.key][0] * w; });
    });
    APPROACHES.forEach(function (a) { out[a.key] = out[a.key] / wsum; });
    return out;
  }

  function mount(root) {
    root.classList.add('topic--parallel');
    var preset = 'fleet';
    var selected = null; // approach key highlighted in the matrix

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'We made an opinionated choice: to parallelise work on <b>one repository</b> we run the same repo as ' +
      'separate checkouts and agents on <b>different physical computers</b>, coordinated by the arch and the ' +
      'harness. The usual way is <b>git worktrees + subagents on one machine</b>. Was ours a good idea? Five ' +
      'approaches, fourteen dimensions, ★ out of 5 with a one-line reason each, pros and cons, and a verdict. ' +
      'The <b>total</b> depends on whose situation is scored — pick a weight preset; this fleet is not a solo laptop.';
    root.appendChild(lead);

    // ---- approach cards ----
    root.appendChild(H.el('h3', 'ut-h', 'The five approaches'));
    var cards = H.el('div', 'pa-cards');
    APPROACHES.forEach(function (a) {
      var c = H.el('button', 'pa-card' + (a.you ? ' is-you' : ''));
      c.type = 'button';
      c.dataset.approach = a.key;
      c.innerHTML =
        '<div class="pa-card__head"><span class="pa-card__glyph">' + a.glyph + '</span>' +
        '<span class="pa-card__name">' + esc(a.name) + '</span>' +
        (a.you ? '<span class="ls-you ls-you--sm">ours</span>' : '') + '</div>' +
        '<div class="pa-card__sub">' + esc(a.sub) + '</div>' +
        '<div class="pa-card__total" data-total="' + a.key + '"></div>';
      c.addEventListener('click', function () { selected = selected === a.key ? null : a.key; paint(); });
      cards.appendChild(c);
    });
    root.appendChild(cards);

    // ---- preset row ----
    var presetRow = H.el('div', 'pa-presets');
    presetRow.appendChild(H.el('span', 'pa-presets__label', 'Weights:'));
    var presetBtns = PRESETS.map(function (p) {
      var b = H.el('button', 'ldf-type' + (p.key === preset ? ' on' : ''));
      b.type = 'button';
      b.dataset.preset = p.key;
      b.title = p.sub;
      b.textContent = p.label;
      b.addEventListener('click', function () {
        preset = p.key;
        presetBtns.forEach(function (x) { x.classList.toggle('on', x.dataset.preset === preset); });
        paint();
      });
      presetRow.appendChild(b);
      return b;
    });
    var presetNote = H.el('span', 'pa-presets__note');
    presetRow.appendChild(presetNote);
    root.appendChild(presetRow);

    // ---- the matrix ----
    root.appendChild(H.el('h3', 'ut-h', 'The ratings matrix — dimensions × approaches'));
    root.appendChild(H.el('p', 'ls-axisnote', 'Hover a cell for the one-line reason; click a column\'s card above to highlight it. The weight column is the current preset\'s; the last row is the weighted average.'));
    var wrap = H.el('div', 'ls-tablewrap pa-tablewrap');
    var table = H.el('table', 'ls-table pa-table');
    table.setAttribute('data-matrix', '');
    var thead = H.el('thead');
    var hr = H.el('tr');
    hr.appendChild(H.el('th', 'ls-th', 'Dimension'));
    hr.appendChild(H.el('th', 'ls-th pa-th--w', 'Weight'));
    APPROACHES.forEach(function (a) {
      var th = H.el('th', 'ls-th pa-th' + (a.you ? ' is-you' : ''));
      th.dataset.col = a.key;
      th.innerHTML = a.glyph + '<br>' + esc(a.name);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = H.el('tbody');
    DIMENSIONS.forEach(function (d) {
      var tr = H.el('tr', 'pa-row');
      tr.dataset.dim = d.key;
      var td0 = H.el('td', 'ls-td ls-td--name pa-td--name');
      td0.innerHTML = '<div>' + esc(d.name) + '</div><div class="pa-why">' + esc(d.why) + '</div>';
      tr.appendChild(td0);
      var tdw = H.el('td', 'ls-td pa-td--w');
      tdw.dataset.w = d.key;
      tr.appendChild(tdw);
      APPROACHES.forEach(function (a) {
        var r = d.r[a.key];
        var td = H.el('td', 'ls-td pa-td pa-td--' + r[0]);
        td.dataset.col = a.key;
        td.dataset.stars = String(r[0]);
        td.title = r[1];
        td.innerHTML = '<span class="pa-stars" aria-label="' + r[0] + ' of 5">' + stars(r[0]) + '</span>' +
          '<span class="pa-reason">' + esc(r[1]) + '</span>';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    // totals row
    var trT = H.el('tr', 'pa-row pa-row--total');
    trT.appendChild(H.el('td', 'ls-td ls-td--name pa-td--name', 'Weighted average'));
    trT.appendChild(H.el('td', 'ls-td pa-td--w', '★ / 5'));
    APPROACHES.forEach(function (a) {
      var td = H.el('td', 'ls-td pa-td pa-td--total');
      td.dataset.col = a.key;
      td.dataset.totalCell = a.key;
      trT.appendChild(td);
    });
    tbody.appendChild(trT);
    table.appendChild(tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);

    // ---- pros / cons ----
    root.appendChild(H.el('h3', 'ut-h', 'Pros and cons'));
    var pc = H.el('div', 'pa-pc');
    APPROACHES.forEach(function (a) {
      var box = H.el('div', 'pa-pc__box' + (a.you ? ' is-you' : ''));
      box.dataset.approach = a.key;
      box.innerHTML =
        '<div class="pa-pc__head">' + a.glyph + ' <b>' + esc(a.name) + '</b>' + (a.you ? ' <span class="ls-you ls-you--sm">ours</span>' : '') + '</div>' +
        '<div class="pa-pc__cols"><div><div class="pa-pc__t pa-pc__t--pro">Pros</div><ul>' +
        a.pros.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' +
        '<div><div class="pa-pc__t pa-pc__t--con">Cons</div><ul>' +
        a.cons.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div></div>';
      pc.appendChild(box);
    });
    root.appendChild(pc);

    // ---- verdict ----
    root.appendChild(H.el('h3', 'ut-h', 'Verdict'));
    var v = H.el('div', 'pa-verdict');
    v.setAttribute('data-verdict', '');
    v.innerHTML =
      '<div class="ls-thesis"><span class="ls-thesis__mark">“</span><b>For this fleet it was the right call — because of one dimension that dominates the others.</b> ' +
      'The agents here must run the real Birokrat / BiroNext / SQL Server stack, on Windows, with licences and customer-shaped data, and nothing but a whole machine gives N of those. ' +
      'Add fault isolation, security and true parallel compute and the fleet leads on every structural dimension. It loses on everything organisational: cost, setup, utilization, ' +
      'onboarding, elasticity — the dimensions a solo developer with a plain repo weighs most, which is exactly why worktrees are the common answer and why the common answer does not apply here.' +
      '<span class="ls-thesis__src">Weighted for this fleet the fleet scores highest, and its closest rival is not worktrees but <b>cloud environments</b> — which would win with equal weights, and would win outright if the Birokrat/BiroNext/SQL stack could be imaged. It cannot, so they score 1 on the dimension that dominates. Weighted for a solo dev with a plain repo, worktrees win. Switch the preset above to see all three.</span></div>' +
      '<div class="pa-verdict__cols">' +
      '<div class="pa-verdict__col pa-verdict__col--win"><div class="pa-pc__t pa-pc__t--pro">When the fleet wins</div><ul>' + VERDICT.wins.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="pa-verdict__col pa-verdict__col--lose"><div class="pa-pc__t pa-pc__t--con">When worktrees would be better</div><ul>' + VERDICT.loses.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +
      '<div class="ut-note"><b>Do both:</b> ' + esc(VERDICT.hybrid) + '</div>';
    root.appendChild(v);

    // ---- sources ----
    root.appendChild(H.el('h3', 'ut-h', 'Sources'));
    var src = H.el('div', 'ls-sources');
    SOURCES.forEach(function (s) {
      var a = H.el('a', 'ls-source', s[0]);
      a.href = s[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      src.appendChild(a);
    });
    root.appendChild(src);

    // ---- paint: weights, totals, highlight ----
    function paint() {
      var t = totals(preset);
      var best = null;
      APPROACHES.forEach(function (a) { if (best === null || t[a.key] > t[best]) best = a.key; });
      DIMENSIONS.forEach(function (d) {
        var cell = root.querySelector('[data-w="' + d.key + '"]');
        var w = d.w[preset];
        cell.textContent = '×' + w;
        cell.className = 'ls-td pa-td--w pa-w--' + w;
      });
      APPROACHES.forEach(function (a) {
        var val = t[a.key].toFixed(1);
        var tc = root.querySelector('[data-total-cell="' + a.key + '"]');
        tc.textContent = val + ' ★';
        tc.classList.toggle('is-best', a.key === best);
        var cc = root.querySelector('[data-total="' + a.key + '"]');
        cc.textContent = val + ' ★ weighted';
        cc.classList.toggle('is-best', a.key === best);
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-col]'), function (el) {
        el.classList.toggle('is-sel', selected !== null && el.dataset.col === selected);
        el.classList.toggle('is-dim', selected !== null && el.dataset.col !== selected);
      });
      Array.prototype.forEach.call(root.querySelectorAll('.pa-card'), function (el) {
        el.classList.toggle('is-sel', el.dataset.approach === selected);
      });
      var p = PRESETS.filter(function (x) { return x.key === preset; })[0];
      presetNote.textContent = p.sub + ' → best: ' + APPROACHES.filter(function (a) { return a.key === best; })[0].name;
      root.dataset.best = best;
    }
    paint();
    return {};
  }

  H.register({
    id: 'parallel',
    label: '🖥️ Fleet vs worktrees',
    tabDesc: 'was one agent per machine a good idea?',
    mount: mount,
  });
})();
