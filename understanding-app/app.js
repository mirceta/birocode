// Understanding app — "Why the LAN can't reach this harness".
// Rolling latest (CLAUDE.md convention): overwritten whenever the explanation changes.
// Build-less, self-contained, relative URLs only — it is served under
// /api/localview/<repo>/app/understanding/, so a leading slash would escape the prefix.

// ---------------------------------------------------------------- stage data
// Every value below was measured on SQLBIROKRAT2 on 2026-09-06, not assumed.
const STAGES = [
  {
    id: 'fw',
    n: 'Hop 1',
    t: 'Windows Firewall',
    v: 'FIXED',
    state: 'ok',
    heading: 'This was the blocker. An inbound rule was added on 2026-09-06 and the port is now open.',
    body: [
      '<strong>The fix:</strong> one inbound rule, scoped to the Private profile and to <code>192.168.0.0/24</code> so it mirrors <code>LanBypassCidrs</code> rather than opening the port on every network this box ever joins. Adding it requires Administrator. The corrected step-6 check now reports <code>OPEN| Claude Web backend (5099)</code>.',
      '<strong>What was wrong:</strong> all three profiles are ON with policy <code>BlockInbound,AllowOutbound</code>, and the Ethernet NIC is on the <strong>Private</strong> profile. Windows therefore drops any inbound connection that no rule permits.',
      'A rule-by-rule sweep found <strong>zero</strong> rules naming port 5099 and <strong>zero</strong> rules whose program is <code>ClaudeWeb.exe</code>. 140 inbound allow rules passed a naive port test, but every one was scoped — either to another program, or to a UWP app package (those report <code>Program = Any</code> yet apply only to their own package). None let 5099 through.',
      'From another machine this looks like a connection timeout or "refused" — <em>not</em> the harness\u2019s "not approved" rejection page. That distinction is the fastest way to tell this apart from the IP gate below.'
    ],
    code: 'netstat -ano | findstr :5099\n  TCP  0.0.0.0:5099  LISTENING  12804   <- bound fine\n\nGet-NetFirewallProfile -> BlockInbound (Domain/Private/Public, all ON)\nrules naming port 5099 ........ 0\nrules with Program=ClaudeWeb ... 0\nrules LocalPort=Any AND Program=Any ... 0'
  },
  {
    id: 'bind',
    n: 'Hop 2',
    t: 'Kestrel bind',
    v: 'OK',
    state: 'ok',
    heading: 'The harness listens on every interface, exactly as intended',
    body: [
      '<code>EmbeddedApi.cs:117</code> calls <code>UseUrls("http://0.0.0.0:{Port}")</code>, and netstat confirms <code>0.0.0.0:5099 LISTENING</code> under PID 12804 (<code>.selfdev-build\\run-bin\\ClaudeWeb.exe</code>).',
      'So this is <strong>not</strong> the classic "bound to localhost only" mistake. The socket is open to the network; the firewall simply never lets anyone arrive at it.',
      'Note this is an IPv4-only bind (<code>0.0.0.0</code>, not <code>ListenAnyIP</code>). Harmless here — LAN clients reach it by IPv4 address — but it is the documented footgun for anything addressed as <code>localhost</code>.'
    ],
    code: 'ClaudeWeb.App/Services/Hosting/EmbeddedApi.cs:117\n  builder.WebHost.UseUrls($"http://0.0.0.0:{_config.Port}");'
  },
  {
    id: 'ip',
    n: 'Hop 3',
    t: 'IP gate',
    v: 'would pass',
    state: 'blocked',
    heading: 'LanBypassCidrs already admits the whole subnet',
    body: [
      'The outermost gate is <code>IpFilterMiddleware</code>. Live config sets <code>LanBypassCidrs: ["192.168.0.0/24"]</code>, so any device on the local subnet clears it without being individually approved.',
      'The approved-guest list holds only <code>127.0.0.1</code> — but that does not matter for LAN clients, because the CIDR bypass admits them first.',
      'Verdict: this gate is <strong>not</strong> the blocker. It is greyed out only because no request ever gets far enough to be judged by it.',
      'If your other computer is on a <em>different</em> subnet, this becomes the blocker instead — and the symptom changes to a standalone "not approved" page rather than a timeout.'
    ],
    code: 'appsettings.json (live)\n  "LanBypassCidrs": ["192.168.0.0/24"]   <- covers 192.168.0.x\n  "TrustedProxyIps": ["192.168.0.122"]\n\n%APPDATA%\\ClaudeWeb\\ipallow.json\n  Guests: [ 127.0.0.1 ]'
  },
  {
    id: 'pw',
    n: 'Hop 4',
    t: 'Password gate',
    v: 'weak',
    state: 'blocked',
    heading: 'Guards /api/* only — and the password is still the default',
    body: [
      '<code>PasswordAuthMiddleware</code> gates <code>/api/*</code> and nothing else; the SPA shell and static assets are served to anyone who cleared the IP gate. <code>GET /api/health</code> and <code>/api/auth/check</code> are exempt, which is why the health probe answers without a login.',
      'The access code is still <code>changeme</code> — the committed default, seeded into <code>auth.json</code> on this box\u2019s first run because there was no existing secret to preserve.',
      '<strong>The live secret is not in <code>appsettings.json</code>.</strong> <code>AuthService.LoadOrSeed</code> hashes <code>AppConfig.AuthPassword</code> into <code>%APPDATA%\\ClaudeWeb\\auth.json</code> (PBKDF2-SHA256) on first run and ignores the config value from then on. Editing the JSON changes nothing.',
      'Change it with the <strong>&ldquo;Set access code&rdquo; button on the harness\u2019s desktop window</strong> (<code>MainForm</code> \u2192 <code>AuthService.SetPassword</code>) — the only sanctioned setter, since OpenSpec <code>add-desktop-access-code</code> deleted the web endpoint on purpose. It also revokes live sessions, so every device re-authenticates.',
      'This is not what is blocking you, but it becomes the only thing standing between the LAN and this harness the moment the firewall rule is added. Change it first.'
    ],
    code: 'appsettings.json (live)  <- FIRST-RUN SEED ONLY, not the live secret\n  "AuthPassword": "changeme"        <- default, never set\n  "WorkingDirectory": "C:\\\\Users\\\\km\\\\Desktop\\\\claude-web-workspace"\n                                    <- does not exist on this box\n\n%APPDATA%\\ClaudeWeb\\auth.json      <- the real secret (PBKDF2 hash)\n  seeded 2026-09-06 from "changeme"'
  }
];

// ------------------------------------------------------------ installer checks
// The 9 steps of installer/Services/DeployerService.cs, run headlessly.
const CHECKS = [
  { n: 1, label: 'Local Setup passed', got: 'ok', result: 'exe + client/dist present',
    truth: null },
  { n: 2, label: 'Backend responding (localhost)', got: 'ok', result: 'HTTP 200 on 127.0.0.1:5099',
    truth: null },
  { n: 3, label: 'Backend reachable on the network', got: 'ok', result: 'HTTP 200 on 192.168.0.211:5099',
    lie: true,
    truth: 'FALSE PASS. It probes the box\u2019s own LAN IP from the box itself. Windows routes that via loopback, so the packet never crosses the firewall. This check cannot fail the way a real LAN client fails — it proves the bind, not the reachability.' },
  { n: 4, label: 'Proxy target matches backend port', got: 'ok', result: 'Port=5099 = listener 5099',
    truth: null },
  { n: 5, label: 'Security notes', got: 'warn', result: 'AuthPassword is still "changeme"',
    truth: 'Correctly flagged — and it is real. Informational only, never blocks the deploy.' },
  { n: 6, label: 'Firewall: backend port open', got: 'ok', result: 'reported OPEN',
    lie: true,
    truth: 'FALSE PASS. The query accepts any enabled inbound allow rule whose <code>LocalPort</code> is <code>5099</code> <em>or</em> <code>Any</code>, ignoring the program scope. Eleven rules matched here — all program-scoped to unrelated apps, none opening 5099. A port-wide test must also require <code>Program = Any</code>.' },
  { n: 7, label: 'Reverse-proxy web.config generated', got: 'bad', result: 'not generated',
    truth: 'Genuinely absent, but irrelevant on this box — the IIS proxy fronts a different machine.' },
  { n: 8, label: 'Local health 200', got: 'ok', result: 'HTTP 200',
    truth: null },
  { n: 9, label: 'Public health 200', got: 'ok', result: 'HTTP 200 from next5.birokrat.si',
    lie: true,
    truth: 'MISLEADING. The 200 comes from <code>WIN-QVH03HBBI3A</code>, a different harness entirely. It says nothing about this box. See section 3.' }
];

const BOXES = [
  { name: 'SQLBIROKRAT2', mine: true, rows: [
      ['LAN IP', '192.168.0.211'], ['repos', '1'], ['build', '553fb73 (just deployed)'],
      ['reached via', 'localhost only'] ] },
  { name: 'WIN-QVH03HBBI3A', mine: false, rows: [
      ['role', 'the box in docs/networking.md'], ['repos', '19'],
      ['reached via', 'next5.birokrat.si -> IIS 192.168.0.122'], ['relation', 'a different fleet machine'] ] }
];

// ------------------------------------------------------------------- rendering
const journeyEl = document.getElementById('journey');
const detailEl = document.getElementById('detail');

STAGES.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'stage ' + s.state;
  b.type = 'button';
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="n">${s.n}</span><span class="t">${s.t}</span><span class="v">${s.v}</span>`;
  b.addEventListener('click', () => select(i));
  journeyEl.appendChild(b);
});

function select(i) {
  const s = STAGES[i];
  [...journeyEl.children].forEach((el, j) =>
    el.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
  const cls = s.state === 'bad' ? 'bad' : s.state === 'ok' ? 'ok' : '';
  detailEl.innerHTML =
    `<h3>${s.t} &mdash; <span class="verdict ${cls}">${s.v}</span></h3>` +
    `<p>${s.heading}</p>` +
    s.body.map(p => `<p>${p}</p>`).join('') +
    (s.code ? `<pre><code>${escapeHtml(s.code)}</code></pre>` : '');
}

function escapeHtml(t) {
  return t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Open on the failing hop — that is the answer to the question being asked.
select(0);

// checks table
const checksEl = document.getElementById('checks');
const showTruth = document.getElementById('showTruth');

function renderChecks() {
  const on = showTruth.checked;
  const pill = g => `<span class="pill ${g === 'ok' ? 'ok' : g === 'warn' ? 'warn' : 'bad'}">${
    g === 'ok' ? 'PASS' : g === 'warn' ? 'WARN' : 'FAIL'}</span>`;
  checksEl.innerHTML =
    `<thead><tr><th>#</th><th>Installer step</th><th>Reported</th><th>Detail</th>${
      on ? '<th>What it actually proves</th>' : ''}</tr></thead><tbody>` +
    CHECKS.map(c => `<tr class="${on && c.lie ? 'lie' : ''}">` +
      `<td>${c.n}</td><td>${c.label}</td><td>${pill(c.got)}</td><td>${c.result}</td>` +
      (on ? `<td class="truth">${c.truth || '&mdash;'}</td>` : '') +
      `</tr>`).join('') +
    `</tbody>`;
}
showTruth.addEventListener('change', renderChecks);
renderChecks();

// boxes
document.getElementById('boxes').innerHTML = BOXES.map(b =>
  `<div class="box ${b.mine ? 'this' : ''}">
     <h3>${b.name}${b.mine ? '<span class="tag">this box</span>' : ''}</h3>
     <dl>${b.rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
   </div>`).join('');
