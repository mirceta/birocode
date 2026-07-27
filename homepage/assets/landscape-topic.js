// Topic 4 — "How we compare" — the agent-harness landscape.
//
// Presents the July-2026 competitive research: what class of tool Claude Web is,
// who its siblings are, and where it sits. Three interactive pieces:
//   (1) a 2-axis POSITIONING MAP (SVG scatter) — desk-bound↔remote × single-agent↔
//       orchestration/OS — click a dot to read that product's profile;
//   (2) a cross-dimension COMPARISON TABLE synced to the map (click a row → the dot
//       lights up, and vice-versa);
//   (3) "what to steal" cards + the market thesis ("the harness is the product").
//
// Build-less and self-contained: vanilla JS + the shared design tokens, plus a
// small ls-* block in styles.css. Sources are real URLs from the research pass.

(function () {
  var H = window.ClaudeWebHome;

  // ---- the field, plotted on two axes (0..100) --------------------------------
  //   x: 0 = editor/desk-bound (presence-required)  →  100 = remote / async / autonomous
  //   y: 0 = single-agent tool                       →  100 = multi-agent orchestration / OS
  var PRODUCTS = [
    {
      id: 'claudeweb', name: 'Claude Web (this)', glyph: '🧭', you: true,
      x: 82, y: 72,
      surface: 'One rich web UI, phone-first',
      focus: 'Software dev over a repo',
      multi: 'Docks + autopilot loops',
      selfhost: 'Yes — single operator',
      visual: 'Understanding apps (auto SPAs)',
      blurb: 'A remote-first, self-hosted agent operating environment: detached run ' +
        'sessions that survive disconnect, a dock/tab shell, autopilot loops, live ' +
        'previews, and self-deploy with a dead-man rollback. Occupies a sparsely-' +
        'populated corner: remote + OS-like + personal + repo-focused + auto-visual.',
    },
    {
      id: 'hermes', name: 'Hermes Agent', glyph: '🪶',
      x: 85, y: 60,
      surface: '20+ chat surfaces (one gateway)',
      focus: 'General assistant + code',
      multi: 'Isolated subagents',
      selfhost: 'Yes — local-first, MIT',
      visual: 'No rich visual output',
      blurb: 'Nous Research, Feb 2026. Closest sibling in spirit — remote, autonomous, ' +
        'multi-surface (CLI/Telegram/Slack/WhatsApp/…). Its edge is a self-improving ' +
        'learning loop: it creates skills from experience and deepens a model of you ' +
        'across sessions. 200+ models, 6 terminal backends.',
      steal: 'The self-improving skill loop — learn a skill from a successful run, store it, improve it on reuse.',
    },
    {
      id: 'openclaw', name: 'OpenClaw', glyph: '🦞',
      x: 35, y: 45,
      surface: 'Local runtime + skills',
      focus: 'General + coding skill',
      multi: 'Kernel + plugin skills',
      selfhost: 'Yes — open source',
      visual: 'n/a',
      blurb: 'The open-source self-hosted harness standard. "Kernel-plugin" design: a ' +
        'minimal trusted core (planning/memory/orchestration) plus an extensible Skills ' +
        'ecosystem. Has a Claw-SWE-Bench eval and a large body of prompt-injection ' +
        'security research — directly relevant to any harness that auto-drives loops.',
      steal: 'A Claw-SWE-Bench-style eval harness to SCORE the harness — and read the injection-hardening papers.',
    },
    {
      id: 'openhands', name: 'OpenHands', glyph: '🖐️',
      x: 70, y: 55,
      surface: 'Web UI, self-host/cloud',
      focus: 'Autonomous SWE tasks',
      multi: 'Isolated exec runtimes',
      selfhost: 'Yes — on-prem/VPC',
      visual: 'n/a',
      blurb: 'Ex-OpenDevin. Runs in your environment with isolated, auditable execution ' +
        'runtimes — built for compliance/governance. The mainstream self-hostable web ' +
        'harness over an autonomous coding agent.',
    },
    {
      id: 'orchestrator', name: 'Agent Orchestrator / agentsmesh', glyph: '🕸️',
      x: 65, y: 90,
      surface: 'Meta-harness / Kanban board',
      focus: 'Parallel coding agents',
      multi: 'Many agents, one workspace',
      selfhost: 'Yes — BYOK',
      visual: 'n/a',
      blurb: 'The multi-agent supervision frontier: run Claude Code / Codex / Cursor / ' +
        'Aider / Goose in parallel, each in its own git-worktree sandbox, supervised ' +
        'from one board with sessions, branches, PRs and feedback loops. agentsmesh ' +
        'adds remote AgentPods with PTY sandboxes + a built-in Kanban.',
      steal: 'Parallel worktree isolation + a Kanban: queue N tasks → each runs in its own worktree → supervise from one board.',
    },
    {
      id: 'devin', name: 'Devin', glyph: '🤖',
      x: 78, y: 50,
      surface: 'Cloud teammate',
      focus: 'Autonomous SWE',
      multi: 'Single autonomous agent',
      selfhost: 'No — hosted',
      visual: 'n/a',
      blurb: 'Cognition. The async "AI teammate" model: hand it a ticket, it plans, ' +
        'browses, codes and opens a PR. Cloud-hosted, not self-host.',
    },
    {
      id: 'goose', name: 'Goose', glyph: '🪿',
      x: 30, y: 40,
      surface: 'Local, extensible',
      focus: 'General dev agent',
      multi: 'MCP extensions / recipes',
      selfhost: 'Yes — open source',
      visual: 'n/a',
      blurb: 'Block\'s open-source local agent: MCP-/extension-first with reusable ' +
        '"recipes". A clean model for a skills/extension architecture.',
    },
    {
      id: 'cursor', name: 'Cursor', glyph: '🖱️',
      x: 32, y: 35,
      surface: 'AI IDE (+ background agents)',
      focus: 'In-editor coding',
      multi: 'Background agent queue',
      selfhost: 'No — hosted',
      visual: 'n/a',
      blurb: 'Editor-centric, presence-required. Background agents nudge it toward ' +
        'async, but the center of gravity is one dev at one editor.',
    },
    {
      id: 'claudecode', name: 'Claude Code', glyph: '💻',
      x: 26, y: 30,
      surface: 'Terminal / IDE / web',
      focus: 'In-terminal coding',
      multi: 'Single session (+ subagents)',
      selfhost: 'CLI on your box',
      visual: 'n/a',
      blurb: 'The agent this harness wraps. Deepest hooks system in the field (30 ' +
        'lifecycle events). On its own it is single-session and desk-bound — Claude ' +
        'Web is the control plane that makes it remote, persistent and multi-agent.',
    },
    {
      id: 'aider', name: 'Aider', glyph: '⌨️',
      x: 15, y: 16,
      surface: 'Terminal pair-programmer',
      focus: 'Repo-map coding',
      multi: 'Single session',
      selfhost: 'CLI on your box',
      visual: 'n/a',
      blurb: 'Tight git integration, strong repo map, cost discipline. The lean, ' +
        'single-agent, at-the-desk end of the spectrum.',
    },
  ];

  // dimensions shown as table columns (keys map onto PRODUCTS fields)
  var COLS = [
    { key: 'surface', label: 'Primary surface' },
    { key: 'focus', label: 'Focus' },
    { key: 'multi', label: 'Multi-agent' },
    { key: 'selfhost', label: 'Self-host' },
    { key: 'visual', label: 'Visual explainers' },
  ];

  // "what to steal" — the highest-value borrows, with source attribution.
  // Each card carries `videos`: YouTube demos/talks of the feature, found in the
  // July-2026 video research pass and verified live via the oEmbed endpoint.
  var STEALS = [
    {
      from: 'Hermes Agent', glyph: '🪶',
      title: 'Self-improving skill loop',
      body: 'Autopilot already mines routine prompts. The next rung: learn a skill from a ' +
        'successful run, store it, and improve it on reuse — a deepening model of how you work.',
      rank: 'highest leverage',
      videos: [
        { id: 'CEvIs9y1uog', title: 'Don’t Build Agents, Build Skills Instead — Barry Zhang & Mahesh Murag (Anthropic)', channel: 'AI Engineer' },
        { id: 'KtxC8d6ne10', title: 'Multi SKILL.MD Configurations: Self-learning AI', channel: 'Discover AI' },
        { id: 'Y-pgbjTlYgk', title: 'Voyager — skill reuse: learn a skill from a successful run, store it, retrieve it', channel: 'John Tan Chong Min' },
      ],
    },
    {
      from: 'OpenClaw', glyph: '🦞',
      title: 'Score the harness + harden it',
      body: 'Add a Claw-SWE-Bench-style eval so System Tests produce a SCORE, not just pass/fail. ' +
        'And read the injection papers: auto-driven loops over untrusted repo content are exactly ' +
        'the attack surface (cf. the ungated off-box /preview/ hole).',
      rank: "don't skip",
      videos: [
        { id: '9takkdtTjS0', title: 'Claw-SWE-Bench: Benchmark for LLM Coding Agents', channel: 'AI Research Roundup' },
        { id: 'EcsTq4Cunio', title: 'OpenClaw Needs a Security Harness, Not Just Better Prompts', channel: 'kl2217' },
        { id: 'js6rgedzjGs', title: 'Prompt Injection and the Lethal Trifecta — minimising risks of agents', channel: 'CharlieCowanAI' },
      ],
    },
    {
      from: 'agentsmesh / Agent Orchestrator', glyph: '🕸️',
      title: 'Parallel worktrees + Kanban',
      body: 'Queue N tasks → each runs in its own git-worktree sandbox → supervise from one board. ' +
        'The task graph + docks are close; this is the clearest missing capability.',
      rank: 'clearest gap',
      videos: [
        { id: 'PgWHvLRaEAU', title: 'Vibe Kanban: 10X Productivity Boost by Running Multiple Agents in Parallel', channel: 'AI Stack Engineer' },
        { id: 'sf8cmVew3nU', title: 'Conductor — Claude Code UIs for Parallel Agents', channel: 'Bernardo Amorim' },
        { id: 'rFGlJ4oIlhw', title: 'Parallel Claude Code + Git Worktrees: This Setup Will Change How You Ship', channel: 'Cole Medin' },
      ],
    },
    {
      from: 'the whole field', glyph: '🧑‍✈️',
      title: 'A master agent that delegates',
      body: 'You talk to ONE top-level agent; it plans, hands subtasks to specialized ' +
        'subagents, collects their results, and reports back. Claude Web has docks of ' +
        'independent agents plus a task graph — but no delegation layer between them. ' +
        'The irony: the wrapped agent (Claude Code) already ships subagents; the harness ' +
        'just never surfaces a "talk to the manager" mode.',
      rank: 'you flagged it',
      wide: true,
      haveIt: [
        ['Claude Code', 'Task tool → subagents in .claude/agents/, each with its own context + tools'],
        ['Devin', 'MultiDevin — a manager Devin coordinates ~10 worker Devins in isolated VMs'],
        ['OpenAI Agents SDK', 'manager pattern (agents-as-tools) + handoffs'],
        ['CrewAI', 'hierarchical process — a manager agent plans, delegates, validates'],
        ['MS Agent Framework', 'Magentic orchestrator delegates to WebSurfer / Coder / Terminal agents'],
        ['LangGraph', 'supervisor pattern + hierarchical teams-of-teams'],
        ['Google ADK', 'parent coordinator agent transfers work to sub_agents'],
      ],
      videos: [
        { id: 'Phr7vBx9yFQ', title: 'Claude Code Tutorial #8 — Subagents', channel: 'Net Ninja' },
        { id: 'B_0TNuYi56w', title: 'Hierarchical multi-agent systems with LangGraph', channel: 'LangChain' },
        { id: 'iJHJaTOwggs', title: 'Claude Code Can Spawn 1,000 Agents (Here’s How)', channel: 'CloudYeti | AI Engineering' },
      ],
    },
  ];

  var SKIP = 'Hermes’s 20-surface sprawl. One excellent web UI is a feature, not a limit — ' +
    'chasing WhatsApp/Signal parity would dilute it.';

  var SOURCES = [
    ['OpenClaw coding tools (Fastio)', 'https://fast.io/resources/top-openclaw-tools-coding-agents/'],
    ['Claw-SWE-Bench', 'https://arxiv.org/pdf/2606.12344'],
    ['Trojan’s Whisper: injection attacks on OpenClaw', 'https://arxiv.org/pdf/2603.19974'],
    ['Hermes Agent (Nous Research)', 'https://hermes-agent.nousresearch.com/'],
    ['Hermes Agent (GitHub)', 'https://github.com/nousresearch/hermes-agent'],
    ['Best AI Coding Agents 2026: harness compared (Firecrawl)', 'https://www.firecrawl.dev/blog/best-ai-coding-agents'],
    ['Agent Harness Engineering — the AI Control Plane (Medium)', 'https://medium.com/@adnanmasood/agent-harness-engineering-the-rise-of-the-ai-control-plane-938ead884b1d'],
    ['Stop Comparing LLM Agents Without Disclosing the Harness', 'https://arxiv.org/pdf/2605.23950'],
    ['OpenHands', 'https://www.openhands.dev/'],
    ['Awesome Agent Orchestrators', 'https://github.com/andyrewlee/awesome-agent-orchestrators'],
    ['9 Open-Source Agent Orchestrators (Augment)', 'https://www.augmentcode.com/tools/open-source-agent-orchestrators'],
    ['Claude Code subagents (docs)', 'https://code.claude.com/docs/en/sub-agents'],
    ['LangGraph multi-agent / supervisor', 'https://langchain-ai.github.io/langgraph/concepts/multi_agent/'],
    ['OpenAI Agents SDK — orchestrating multiple agents', 'https://openai.github.io/openai-agents-python/multi_agent/'],
    ['CrewAI hierarchical process', 'https://docs.crewai.com/learn/hierarchical-process'],
  ];

  // ---- YouTube video cards (lazy: thumbnail first, iframe only on click) -------
  // Thumbnails come from i.ytimg.com; the player embeds via youtube-nocookie.com.
  // Both are absolute external URLs, so the relative-URL proxy contract is untouched.
  function videoList(videos) {
    var wrap = H.el('div', 'ls-videos');
    videos.forEach(function (v) {
      var card = H.el('div', 'ls-video');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Play: ' + v.title);

      var tw = H.el('div', 'ls-video__thumbwrap');
      var img = H.el('img', 'ls-video__thumb');
      img.src = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
      img.alt = '';
      img.loading = 'lazy';
      tw.appendChild(img);
      tw.appendChild(H.el('div', 'ls-video__play', '▶'));
      card.appendChild(tw);

      var meta = H.el('div', 'ls-video__meta');
      meta.appendChild(H.el('div', 'ls-video__title', v.title));
      var ch = H.el('div', 'ls-video__channel');
      ch.appendChild(document.createTextNode(v.channel + ' · '));
      var ext = H.el('a', 'ls-video__ext', 'YouTube ↗');
      ext.href = 'https://www.youtube.com/watch?v=' + v.id;
      ext.target = '_blank';
      ext.rel = 'noopener noreferrer';
      ext.addEventListener('click', function (e) { e.stopPropagation(); });
      ch.appendChild(ext);
      meta.appendChild(ch);
      card.appendChild(meta);

      function play() {
        var holder = H.el('div', 'ls-video is-playing');
        var f = document.createElement('iframe');
        f.className = 'ls-video__frame';
        f.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.setAttribute('allowfullscreen', '');
        f.title = v.title;
        holder.style.display = 'block';
        holder.appendChild(f);
        holder.appendChild(H.el('div', 'ls-video__caption', v.title + ' — ' + v.channel));
        card.replaceWith(holder);
      }
      card.addEventListener('click', play);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
      });
      wrap.appendChild(card);
    });
    return wrap;
  }

  // ---- SVG positioning map ----------------------------------------------------
  var VB_W = 820, VB_H = 540;
  var PAD_L = 66, PAD_R = 40, PAD_T = 40, PAD_B = 58;
  function sx(x) { return PAD_L + (x / 100) * (VB_W - PAD_L - PAD_R); }
  function sy(y) { return (VB_H - PAD_B) - (y / 100) * (VB_H - PAD_T - PAD_B); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function mount(root) {
    root.classList.add('topic--landscape');

    var lead = H.el('p', 'topic__lead');
    lead.innerHTML =
      'What class of app is this? A <b>coding-agent harness</b> — a control plane around an ' +
      'underlying agent (Claude Code). The field has converged on exactly that idea: ' +
      '<em>the frontier models have leveled off, so the harness around the model now does most ' +
      'of the work.</em> Below: where Claude Web sits among its 2026 siblings, compared across ' +
      'dimensions, and what’s worth borrowing.';
    root.appendChild(lead);

    // shared selection state across map + table
    var selectedId = 'claudeweb';
    var dotEls = {}, rowEls = {};

    // ----- market thesis callout -----
    var thesis = H.el('div', 'ls-thesis');
    thesis.innerHTML =
      '<span class="ls-thesis__mark">“</span>The frontier models inside these tools have largely ' +
      'converged, and <b>the harness around the model now does most of the work.</b> Practitioners ' +
      'increasingly treat the harness as the runtime that turns a model into an agent.' +
      '<span class="ls-thesis__src">— 2026 landscape (Firecrawl; “Agent Harness Engineering”)</span>';
    root.appendChild(thesis);

    // ----- the positioning map -----
    root.appendChild(H.el('h3', 'ut-h', 'The map — where each tool sits'));
    var mapNote = H.el('p', 'ls-axisnote');
    mapNote.innerHTML = 'Horizontal: <b>desk-bound</b> → <b>remote / async</b>. ' +
      'Vertical: <b>single agent</b> → <b>orchestration / OS</b>. Click any dot.';
    root.appendChild(mapNote);

    var mapWrap = H.el('div', 'ls-map');
    var s = svg('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, class: 'ls-svg',
      preserveAspectRatio: 'xMidYMid meet', role: 'img',
      'aria-label': 'Positioning map of coding-agent harnesses' });

    // quadrant shading (upper-right = the sparse corner Claude Web occupies)
    s.appendChild(svg('rect', { x: sx(50), y: sy(100), width: sx(100) - sx(50),
      height: sy(50) - sy(100), class: 'ls-quad' }));

    // grid + axis lines
    [25, 50, 75].forEach(function (g) {
      s.appendChild(svg('line', { x1: sx(g), y1: sy(0), x2: sx(g), y2: sy(100), class: 'ls-grid' }));
      s.appendChild(svg('line', { x1: sx(0), y1: sy(g), x2: sx(100), y2: sy(g), class: 'ls-grid' }));
    });
    s.appendChild(svg('line', { x1: sx(0), y1: sy(0), x2: sx(100), y2: sy(0), class: 'ls-axis' }));
    s.appendChild(svg('line', { x1: sx(0), y1: sy(0), x2: sx(0), y2: sy(100), class: 'ls-axis' }));

    function axisText(x, y, cls, str, anchor) {
      var t = svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor || 'middle' });
      t.textContent = str;
      s.appendChild(t);
    }
    axisText(sx(2), sy(0) + 34, 'ls-axlabel', 'desk-bound', 'start');
    axisText(sx(100), sy(0) + 34, 'ls-axlabel', 'remote / async', 'end');
    // vertical axis labels (rotated)
    var vt1 = svg('text', { class: 'ls-axlabel', 'text-anchor': 'start',
      transform: 'translate(' + (sx(0) - 46) + ',' + (sy(0)) + ') rotate(-90)' });
    vt1.textContent = 'single agent';
    s.appendChild(vt1);
    var vt2 = svg('text', { class: 'ls-axlabel', 'text-anchor': 'end',
      transform: 'translate(' + (sx(0) - 46) + ',' + (sy(100)) + ') rotate(-90)' });
    vt2.textContent = 'orchestration / OS';
    s.appendChild(vt2);
    axisText(sx(75), sy(50) - 8, 'ls-quadlabel', 'remote + OS-like', 'middle');

    // detail panel (updates on select)
    var detail = H.el('div', 'ls-detail');
    function renderDetail(p) {
      detail.innerHTML =
        '<div class="ls-detail__head">' +
          '<span class="ls-detail__glyph">' + p.glyph + '</span>' +
          '<span class="ls-detail__name">' + p.name + '</span>' +
          (p.you ? '<span class="ls-you">you are here</span>' : '') +
        '</div>' +
        '<p class="ls-detail__blurb">' + p.blurb + '</p>' +
        (p.steal ? '<p class="ls-detail__steal"><b>Borrow:</b> ' + p.steal + '</p>' : '');
    }

    function select(id) {
      selectedId = id;
      PRODUCTS.forEach(function (p) {
        var on = p.id === id;
        if (dotEls[p.id]) dotEls[p.id].g.classList.toggle('is-sel', on);
        if (rowEls[p.id]) rowEls[p.id].classList.toggle('is-sel', on);
      });
      var sel = PRODUCTS.filter(function (p) { return p.id === id; })[0];
      if (sel) renderDetail(sel);
    }

    // plot dots (draw non-selected first so 'you' can pop; label placement flips
    // to the left near the right edge so text never clips)
    PRODUCTS.forEach(function (p) {
      var g = svg('g', { class: 'ls-node' + (p.you ? ' is-you' : ''), tabindex: '0',
        role: 'button', 'aria-label': p.name });
      var cx = sx(p.x), cy = sy(p.y);
      g.appendChild(svg('circle', { cx: cx, cy: cy, r: p.you ? 11 : 7, class: 'ls-dot' }));
      if (p.you) g.appendChild(svg('circle', { cx: cx, cy: cy, r: 18, class: 'ls-halo' }));
      var leftSide = p.x > 66;
      var label = svg('text', {
        x: leftSide ? cx - 15 : cx + 14, y: cy + 4,
        'text-anchor': leftSide ? 'end' : 'start',
        class: 'ls-dotlabel' + (p.you ? ' is-you' : ''),
      });
      label.textContent = p.name;
      g.appendChild(label);
      g.addEventListener('click', function () { select(p.id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); }
      });
      s.appendChild(g);
      dotEls[p.id] = { g: g };
    });

    mapWrap.appendChild(s);
    root.appendChild(mapWrap);
    root.appendChild(detail);

    // ----- comparison table -----
    root.appendChild(H.el('h3', 'ut-h', 'Compared across dimensions'));
    var tableWrap = H.el('div', 'ls-tablewrap');
    var table = H.el('table', 'ls-table');
    var thead = H.el('thead');
    var htr = H.el('tr');
    htr.appendChild(H.el('th', 'ls-th ls-th--name', 'Tool'));
    COLS.forEach(function (c) { htr.appendChild(H.el('th', 'ls-th', c.label)); });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = H.el('tbody');
    PRODUCTS.forEach(function (p) {
      var tr = H.el('tr', 'ls-row' + (p.you ? ' is-you' : ''));
      var nameTd = H.el('td', 'ls-td ls-td--name');
      nameTd.innerHTML = '<span class="ls-td__glyph">' + p.glyph + '</span>' +
        '<span class="ls-td__name">' + p.name + '</span>' +
        (p.you ? '<span class="ls-you ls-you--sm">you</span>' : '');
      tr.appendChild(nameTd);
      COLS.forEach(function (c) { tr.appendChild(H.el('td', 'ls-td', p[c.key])); });
      tr.addEventListener('click', function () { select(p.id); });
      tbody.appendChild(tr);
      rowEls[p.id] = tr;
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    // ----- what to steal -----
    root.appendChild(H.el('h3', 'ut-h', 'What’s worth stealing'));
    var grid = H.el('div', 'ls-steals');
    STEALS.forEach(function (st) {
      var card = H.el('div', 'ls-steal' + (st.wide ? ' ls-steal--wide' : ''));
      card.innerHTML =
        '<div class="ls-steal__head">' +
          '<span class="ls-steal__glyph">' + st.glyph + '</span>' +
          '<div><div class="ls-steal__title">' + st.title + '</div>' +
          '<div class="ls-steal__from">from ' + st.from + '</div></div>' +
          '<span class="ls-steal__rank">' + st.rank + '</span>' +
        '</div>' +
        '<p class="ls-steal__body">' + st.body + '</p>';
      if (st.haveIt) {
        card.appendChild(H.el('div', 'ls-steal__watch', 'Who already ships it'));
        var ul = H.el('ul', 'ls-haveit');
        st.haveIt.forEach(function (pair) {
          var li = H.el('li', 'ls-haveit__item');
          li.appendChild(H.el('b', null, pair[0]));
          li.appendChild(document.createTextNode(' — ' + pair[1]));
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      if (st.videos && st.videos.length) {
        card.appendChild(H.el('div', 'ls-steal__watch', 'See it demonstrated'));
        card.appendChild(videoList(st.videos));
      }
      grid.appendChild(card);
    });
    root.appendChild(grid);

    var skip = H.el('div', 'ut-note');
    skip.innerHTML = '<b>What NOT to copy:</b> ' + SKIP;
    root.appendChild(skip);

    // ----- sources -----
    root.appendChild(H.el('h3', 'ut-h', 'Sources (July 2026 research pass)'));
    var srcList = H.el('div', 'ls-sources');
    SOURCES.forEach(function (pair) {
      var a = H.el('a', 'ls-source');
      a.href = pair[1];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = pair[0];
      srcList.appendChild(a);
    });
    root.appendChild(srcList);

    select('claudeweb'); // open on "you are here"
  }

  H.register({
    id: 'landscape',
    label: '🧭 How we compare',
    tabDesc: 'the agent-harness landscape',
    mount: mount,
  });
})();
