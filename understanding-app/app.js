// Fleet Status per-machine panels (openspec fleet-status-panels). Build-less, relative
// URLs. A toy model of two machines: a modern one that reports its overview, and an
// older peer that predates the field (every overview value degrades to n/a).
(function () {
  const TABS = [
    ['agents', 'Agents'],
    ['overview', 'Overview'],
    ['scoreboard', 'Scoreboard'],
  ];

  const machines = [
    {
      name: 'RAZVOJ2016', self: true, build: 'a288bb4',
      agents: [
        { name: 'birocode#1', claimed: false },
        { name: 'prg#2', claimed: true },
      ],
      overview: {
        Version: 'a288bb4', Machine: 'RAZVOJ2016', Timezone: 'CET · UTC+2',
        'Host active': 'yes', 'Admin active': 'active',
        GitHub: 'octocat', Claude: 'me@x.com', 'Claude plan': 'Max',
      },
      scoreboard: { prompts: 128, work: '3h 12m', cost: '$4', ms: 1, bytes: '1.8 KB' },
    },
    {
      name: 'OLDBOX', self: false, build: 'deadbee (old build)',
      agents: [{ name: 'app#1', claimed: false }],
      overview: null, // predates the overview field -> n/a everywhere
      scoreboard: { prompts: 40, work: '52m', cost: '$1', ms: 1, bytes: '0.9 KB' },
    },
  ];

  let tab = 'agents';
  let loading = null; // machine name currently "loading" its scoreboard

  const tabsEl = document.getElementById('tabs');
  const machinesEl = document.getElementById('machines');
  const noteEl = document.getElementById('note');

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [k, label] of TABS) {
      const b = document.createElement('button');
      b.className = 'tab' + (tab === k ? ' tab--on' : '');
      b.textContent = label;
      b.onclick = () => choose(k);
      tabsEl.appendChild(b);
    }
  }

  function choose(k) {
    tab = k;
    if (k === 'scoreboard') {
      // Model the on-demand fetch: a brief spinner per machine, then the payload.
      loading = 'all';
      render();
      setTimeout(() => { loading = null; render(); }, 700);
      noteEl.textContent = 'Scoreboard is fetched on demand (one GET per machine, cached ~3 min) — never on the fleet poll.';
    } else if (k === 'overview') {
      noteEl.textContent = 'Overview rides the fleet poll (cheap, cached). The old peer sent no overview, so its fields show n/a.';
    } else {
      noteEl.textContent = 'Agents is the default tab — the same strip Fleet Status has always shown.';
    }
    render();
  }

  function na(v) { return v == null ? '<span class="na">n/a</span>' : v; }

  function body(m) {
    if (tab === 'agents') {
      return '<div>' + m.agents.map((a) =>
        `<span class="chip"><span class="dot${a.claimed ? ' dot--claimed' : ''}"></span>${a.name}</span>`).join('') + '</div>';
    }
    if (tab === 'overview') {
      const keys = ['Version', 'Machine', 'Timezone', 'Host active', 'Admin active', 'GitHub', 'Claude', 'Claude plan'];
      const o = m.overview;
      const rows = keys.map((k) => {
        // Version/Machine/Host active ride the fleet object; the rest come from overview.
        let v = null;
        if (k === 'Version') v = m.build.split(' ')[0];
        else if (k === 'Machine') v = m.name;
        else if (k === 'Host active') v = m.self ? 'yes' : 'no';
        else v = o ? o[k] : null;
        return `<div class="k">${k}</div><div class="v${v == null ? ' na' : ''}">${na(v)}</div>`;
      }).join('');
      return `<div class="ov">${rows}</div>`;
    }
    // scoreboard
    if (loading) return '<div class="sb spinner">Loading the scoreboard…</div>';
    const s = m.scoreboard;
    return `<div class="sb">prompts <b>${s.prompts}</b> · work <b>${s.work}</b> · cost <b>${s.cost}</b>
      <br><span style="opacity:.7">served in ${s.ms} ms · ${s.bytes}</span></div>`;
  }

  function render() {
    renderTabs();
    machinesEl.innerHTML = '';
    for (const m of machines) {
      const el = document.createElement('div');
      el.className = 'machine';
      el.innerHTML =
        `<div class="mh"><span class="mdot"></span><span class="mname">${m.name}</span>` +
        `${m.self ? '<span class="mbuild">self</span>' : ''}<span class="mbuild">build ${m.build}</span></div>` +
        body(m);
      machinesEl.appendChild(el);
    }
  }

  choose('agents');
})();
