// Fleet task 5afbb125 — ANALYSIS ONLY: a secure bridge so the sofa can see (later drive) every fleet agent
// through the Hub. Facts read from both repos' code on 2026-10-10; nothing was built.
// Everything the page shows lives here; app.js only renders it.
window.BRIDGE = {
  question: 'How can the sofa see every agent in the fleet without handing the living room an admin key?',
  answer: 'Bridge the Living-room PC into the fleet network one way, through the Hub (which is on both networks), so the projector opens peers at their real 192.168.0.x addresses. Give every harness a read-only Viewer Session, so the room never holds an admin login. Read first (M1), guarded sends later (M2).',

  // ---- the one-way network bridge (added after the Operator's point: harness links are literal 192.168.0.x) ----
  bridge: {
    facts: [
      ['Hub, Ethernet', '192.168.0.138', 'the fleet network · gateway 192.168.0.3'],
      ['Hub, Wi-Fi', '192.168.1.101', 'the living-room network · gateway 192.168.1.1'],
      ['IP forwarding on the Hub', 'off', 'on both adapters: today nothing crosses between them'],
      ['Living-room PC', '192.168.1.105', 'no route to 192.168.0.x'],
      ['Links the harness opens', 'http://192.168.0.x:5099', 'literal peer addresses from the registry: 7 peers on 192.168.0.x'],
    ],
    why: 'Option C relays transcripts through the Hub, but the harness also opens peers directly: "open harness" on a card, Status, the agent links. Those are 192.168.0.x addresses, dead from the living room. So the projector needs a network path to the fleet, one way only.',
    options: [
      { id: 'F1', name: 'Windows routing + NAT on the Hub', how: 'Turn on IP forwarding and NAT on the Hub; the Living-room PC routes 192.168.0.0/24 via 192.168.1.101.' },
      { id: 'F2', name: 'Port proxies on the Hub', how: 'One built-in netsh portproxy per peer on the Hub\'s Wi-Fi address (192.168.1.101:5215 → 192.168.0.215:5099 …), and a firewall rule that admits only 192.168.1.105.' },
      { id: 'F3', name: 'Tailscale subnet router on the Hub', how: 'Tailscale on the Hub (advertises 192.168.0.0/24) and on the Living-room PC; an access rule allows only the Living-room PC → 192.168.0.x:5099. Try it on one peer first: Windows as a subnet router must be confirmed on this Hub.', pick: true },
      { id: 'F4', name: 'The Hub\'s harness proxies the peers', how: 'New harness code: the Hub serves each peer under a sub-path of its own address.' },
    ],
    matrix: [
      ['Real 192.168.0.x links work on the projector', ['good', 'yes, with a route on the PC'], ['bad', 'no: a port per peer, links rewritten'], ['good', 'yes, unchanged'], ['bad', 'no: Hub sub-paths']],
      ['Fleet cannot reach the living room', ['good', 'yes (NAT)'], ['good', 'yes'], ['good', 'yes (access rule)'], ['good', 'yes']],
      ['What the PC reaches on 192.168.0.x', ['bad', 'every machine, every port'], ['good', ':5099 of listed peers'], ['good', 'only what the rule lists'], ['good', 'harness pages only']],
      ['Who on the Wi-Fi can use it', ['bad', 'any device that adds a route'], ['mid', 'IP 192.168.1.105 (spoofable)'], ['good', 'only the PC\'s device key'], ['mid', 'whoever passes the Hub gate']],
      ['Encrypted over the Wi-Fi', ['bad', 'no'], ['bad', 'no'], ['good', 'yes (WireGuard)'], ['bad', 'no']],
      ['Extra software', ['mid', 'none, but unsupported: ICS would renumber the Wi-Fi side'], ['good', 'none: built into Windows'], ['bad', 'Tailscale + account (or self-hosted Headscale)'], ['good', 'none']],
      ['Effort', ['mid', 'medium · fragile'], ['mid', 'low config + link rewrite in the harness'], ['good', 'low · install + one rule'], ['bad', 'high · proxy traps of sub-paths']],
      ['Verdict', ['bad', 'reject: too wide'], ['mid', 'good if no third party'], ['good', 'best fit'], ['bad', 'not needed']],
    ],
    caveat: [
      ['What peers see', 'Every request from the living room arrives from the Hub\'s address 192.168.0.138, so peers\' IP gates treat the Living-room PC like the Hub.'],
      ['What still protects them', 'The password gate: the projector must log in to each peer it opens.'],
      ['The new risk', 'Logging in means an Admin Session on up to 8 machines, kept in a browser in the living room.'],
      ['The fix', 'Viewer Sessions on every harness, not just the Hub: the projector holds viewer cookies, peers ship the feature by fleet upgrade.'],
    ],
  },

  // ---- three cards at the top ----------------------------------------------------------------------
  cards: [
    { kind: 'warn', title: 'The gap', big: '7 agents', text: 'are all the sofa can see: the Living-room PC\'s own. The Fleet View, with all 9 machines, exists only on the Hub.' },
    { kind: 'bad', title: 'The danger', big: 'Admin · 30 days', text: 'is what a sofa PIN gives the phone today. Any bridge that reuses it lets the sofa do everything.' },
    { kind: 'ok', title: 'The answer', big: 'Viewer · 24 h', text: 'a new session kind on the Hub that can only read. Off until the Operator switches it on.' },
  ],

  // ---- the answer in one table --------------------------------------------------------------------
  summary: [
    ['What will the sofa see?', 'Every machine and agent, as the Hub\'s Status tab shows them, and any agent\'s transcript on the projector.'],
    ['What can the sofa do?', 'M1: look, open, scroll, zoom. Nothing else. M2: type to agents on an allowlist, behind a second switch.'],
    ['What is new on the network?', 'Nothing between machines. The Hub gains a few read-only routes for Viewer Sessions.'],
    ['What must the Operator switch on?', '"Accept sofa viewers" on the Hub (default off), and admit the two living-room devices one by one.'],
    ['What gets built, and where?', 'One PR on the Hub (birocode). No code on the Living-room PC for M1.'],
  ],

  // ---- glossary: the nouns the rest of the page uses ----------------------------------------------
  glossary: [
    ['Hub', 'DESKTOP-POAPPP3, on both networks: Ethernet 192.168.0.138 and Wi-Fi 192.168.1.101. Runs the Arch and the Fleet View.'],
    ['Bridge', 'Proposed. A one-way path through the Hub: the Living-room PC reaches 192.168.0.x:5099, the fleet never reaches 192.168.1.x.'],
    ['Living-room PC', '192.168.1.105 on the living-room Wi-Fi. Runs its own harness (7 agents) and Daljinski; drives the projector.'],
    ['Sofa Phone', 'The phone on the sofa. Uses the /remote page as a remote control.'],
    ['Big Screen', 'Any harness page opened with ?screen=projector. Obeys the remote\'s commands (open, scroll, zoom, layout).'],
    ['Daljinski', 'The Living-room PC\'s own remote app on :5077: mouse, keyboard, YouTube. No login.'],
    ['Admin Session', 'The cookie a password login gives. Every /api route, 30 days.'],
    ['Viewer Session', 'Proposed. A cookie that can call only a short list of read routes, 24 h, revocable.'],
    ['Fleet Channel', 'The Hub polling each peer with that peer\'s admin password, over plain HTTP.'],
    ['Fleet View', 'The Hub\'s merged status of every machine and agent (Management → Status).'],
  ],

  // ---- the map: one set of positions, three views ---------------------------------------------------
  map: {
    groups: [
      { id: 'g_lr', label: 'Living room · Wi-Fi 192.168.1.x' },
      { id: 'g_lan', label: 'Office LAN · 192.168.0.x' },
    ],
    nodes: [
      { id: 'phone', parent: 'g_lr', label: 'Sofa Phone', x: 0, y: 0,
        info: [['Runs', 'the /remote page in the phone\'s browser'], ['Today holds', 'an Admin Session on the Living-room PC (30 d)'], ['After M1', 'a Viewer Session on the Hub (24 h)']] },
      { id: 'dalj', parent: 'g_lr', label: 'Daljinski :5077', x: 260, y: -110,
        info: [['Runs on', 'the Living-room PC'], ['Login', 'none: anyone on the Wi-Fi'], ['Can', 'mouse, keyboard, YouTube on the projector PC'], ['In the bridge?', 'no. Flagged as a separate risk.']] },
      { id: 'lrh', parent: 'g_lr', label: 'Living-room harness :5099\n7 agents', x: 260, y: 110,
        info: [['Runs on', 'the Living-room PC'], ['Login', 'password, or a sofa PIN'], ['Sees', 'only its own 7 agents'], ['After M1', 'unchanged, not in the path']] },
      { id: 'proj', parent: 'g_lr', label: 'Projector\nBig Screen', x: 540, y: 0,
        info: [['Shows', 'a browser on the Living-room PC'], ['Today loads', 'the living-room harness'], ['After M1', 'the Hub\'s Fleet Reader page, as a Viewer']] },
      { id: 'hub', parent: 'g_lan', label: 'Hub :5099 · Fleet View\n0.138 + 1.101', x: 260, y: 285,
        info: [['Machine', 'DESKTOP-POAPPP3'], ['Addresses', 'Ethernet 192.168.0.138 · Wi-Fi 192.168.1.101'], ['Sees', 'every machine and agent'], ['Admits', '192.168.0.0/24, named guests, trusted-device cookies'], ['After M1', 'also Viewer Sessions, if switched on']] },
      { id: 'peers', parent: 'g_lan', label: '7 other peers :5099\nspacex · razvoj2016 · …', x: 560, y: 285,
        info: [['Reached by', 'the Fleet Channel only'], ['Auth', 'each peer\'s admin password, HTTP'], ['Write gates', 'accept sends / upgrades / provisioning, default off'], ['After M1', 'unchanged']] },
    ],
    // kind → colour/line in app.js. views: which of today | m1 | m2 show the edge.
    edges: [
      { id: 'e_ph_dalj', s: 'phone', t: 'dalj', label: 'buttons · no login', kind: 'noauth', views: ['today', 'm1', 'm2', 'bridge'], fadeIn: ['m1', 'm2', 'bridge'],
        info: [['Carries', 'mouse / key / YouTube commands'], ['Auth', 'none'], ['Risk', 'any guest on the Wi-Fi can drive the projector PC']] },
      { id: 'e_dalj_proj', s: 'dalj', t: 'proj', label: 'mouse + keys', kind: 'local', views: ['today', 'm1', 'm2', 'bridge'], fadeIn: ['m1', 'm2', 'bridge'],
        info: [['Carries', 'SendInput on the Living-room PC']] },
      { id: 'e_ph_lrh', s: 'phone', t: 'lrh', label: 'PIN → Admin 30 d', kind: 'admin', views: ['today'],
        info: [['Carries', 'pairing, then every /api call'], ['Auth', 'Admin Session from a 5-minute single-use PIN'], ['Risk', 'the phone can send prompts, stop turns, change settings']] },
      { id: 'e_lrh_proj', s: 'lrh', t: 'proj', label: 'Big Screen commands', kind: 'local', views: ['today'],
        info: [['Carries', 'open / scroll / zoom / layout, polled every second']] },
      { id: 'e_hub_lrh', s: 'hub', t: 'lrh', label: 'Fleet Channel', kind: 'fleet', views: ['today', 'm1', 'm2', 'bridge'], fadeIn: ['m1', 'm2', 'bridge'],
        info: [['Carries', 'describe + events of the living room\'s 7 agents'], ['Auth', 'the living room\'s admin password, HTTP']] },
      { id: 'e_hub_peers', s: 'hub', t: 'peers', label: 'Fleet Channel', kind: 'fleet', views: ['today', 'm1', 'm2'],
        info: [['Carries', 'describe, events, transcripts (Arch only today)'], ['Auth', 'each peer\'s admin password, HTTP'], ['After M1', 'also relays transcripts for Viewers']] },
      { id: 'e_ph_hub_missing', s: 'phone', t: 'hub', label: 'no path to the Fleet View', kind: 'missing', views: ['today'],
        info: [['Today', 'the phone and the Big Screen never talk to the Hub'], ['So', 'the sofa sees 7 agents, not the fleet']] },
      { id: 'e_ph_hub_view', s: 'phone', t: 'hub', label: 'PIN → Viewer 24 h', kind: 'viewer', views: ['m1'],
        info: [['Carries', 'read-only calls on the allowlist'], ['Auth', 'Viewer Session from a Hub PIN'], ['Refused', 'every write route: 403 viewer-session']] },
      { id: 'e_ph_hub_send', s: 'phone', t: 'hub', label: 'Viewer + send gate', kind: 'send', views: ['m2'],
        info: [['Adds', 'prompts to agents on a per-agent allowlist'], ['Gate', '"Sofa may send" (second switch, default off)'], ['Never', 'deploy, upgrade, provision, settings, approvals']] },
      { id: 'e_proj_hub_bridge', s: 'proj', t: 'hub', label: 'Bridge: only :5099', kind: 'bridge', views: ['bridge'],
        info: [['Carries', 'the projector browser opening http://192.168.0.x:5099'], ['Path', 'Living-room PC → Hub Wi-Fi 192.168.1.101 → Hub Ethernet'], ['Allowed', 'only the Living-room PC, only port 5099']] },
      { id: 'e_hub_peers_bridge', s: 'hub', t: 'peers', label: 'as 0.138', kind: 'bridge', views: ['bridge'],
        info: [['Peers see', 'the Hub\'s address'], ['IP gate', 'passes (LAN bypass)'], ['Password gate', 'still asks for a login: Viewer Session per peer']] },
      { id: 'e_peers_proj_none', s: 'peers', t: 'proj', label: 'no way back', kind: 'missing', views: ['bridge'],
        info: [['Fleet → living room', 'blocked: peers have no route to 192.168.1.x, and the bridge only answers connections the living room starts']] },
      { id: 'e_ph_hub_bview', s: 'phone', t: 'hub', label: 'PIN → Viewer 24 h', kind: 'viewer', views: ['bridge'],
        info: [['Carries', 'the remote: fleet list, open, scroll'], ['Auth', 'Viewer Session on the Hub']] },
      { id: 'e_hub_proj', s: 'hub', t: 'proj', label: 'Fleet Reader page (Viewer)', kind: 'viewer', views: ['m1', 'm2'],
        info: [['Carries', 'the Hub\'s Big Screen page, loaded by the projector browser'], ['Auth', 'a Viewer Session: no admin login in the room']] },
    ],
    // step-through traces per view: each step lights up elements and explains them
    traces: {
      today: { name: 'Pair a phone today', steps: [
        ['lrh e_lrh_proj proj', 'The Big Screen shows a PIN, valid 5 minutes, single use.'],
        ['phone e_ph_lrh lrh', 'The phone types the PIN. The living-room harness answers with an Admin Session for 30 days.'],
        ['phone e_ph_lrh lrh', 'The phone can now open and scroll, but also send prompts, stop turns and change settings.'],
        ['hub e_hub_peers peers e_hub_lrh', 'The fleet is only visible to the Hub. Nothing connects the sofa to it.'],
      ] },
      m1: { name: 'Open razvoj2016/prg from the sofa', steps: [
        ['phone e_ph_hub_view hub', 'The phone, paired with a Hub PIN, asks for the Fleet View. Allowed: it is on the Viewer list.'],
        ['phone e_ph_hub_view hub', 'The phone taps razvoj2016/prg. The Hub queues "open-agent" for the Big Screen.'],
        ['hub e_hub_peers peers', 'The Hub fetches the transcript over the Fleet Channel, scrubbed and rate-limited.'],
        ['hub e_hub_proj proj', 'The projector\'s Fleet Reader page shows the agent\'s state and transcript.'],
        ['phone e_ph_hub_view hub', 'If the phone tries to send a prompt, the Hub refuses: 403 viewer-session.'],
      ] },
      bridge: { name: 'Open the spacex harness on the projector', steps: [
        ['phone e_ph_hub_bview hub', 'The phone (a Viewer) taps "open harness" on spacex.'],
        ['proj e_proj_hub_bridge hub', 'The projector browser opens http://192.168.0.215:5099. The Living-room PC sends it to the Hub: the only way to 192.168.0.x.'],
        ['hub e_hub_peers_bridge peers', 'The Hub forwards it. spacex sees the Hub\'s address and passes the IP gate.'],
        ['peers e_hub_peers_bridge hub e_proj_hub_bridge proj', 'spacex asks for a login; the projector holds a Viewer Session for it, so the page is read-only.'],
        ['peers e_peers_proj_none proj', 'spacex cannot start a connection to 192.168.1.105: there is no way back.'],
      ] },
      m2: { name: 'Send a prompt from the sofa (later)', steps: [
        ['phone e_ph_hub_send hub', 'The phone sends a prompt. The Hub checks the "sofa may send" switch and the agent allowlist.'],
        ['hub e_hub_proj proj', 'The Big Screen asks for confirmation in the room.'],
        ['hub e_hub_peers peers', 'The Hub sends it on, only if that peer accepts sends. The call is audited.'],
        ['phone e_ph_hub_send hub', 'Deploy, upgrade, provision and settings stay refused for any Viewer.'],
      ] },
    },
  },

  // ---- today's pieces ------------------------------------------------------------------------------
  pieces: {
    cols: ['Piece', 'Runs on', 'Who gets in', 'What it grants', 'Risk'],
    rows: [
      ['Big Screen listener', 'any harness page', 'whoever is logged in there', 'obeys open, scroll, zoom, lane, layout', ['ok', 'display only']],
      ['Sofa pairing (PIN)', 'Living-room PC', 'anyone who reads the PIN on screen', 'an Admin Session, 30 days', ['bad', 'phone = admin']],
      ['/remote page', 'Living-room PC', 'an Admin Session', 'lists its 7 agents, sends prompts, stops turns', ['warn', 'own agents only']],
      ['Daljinski', 'Living-room PC :5077', 'anyone on the Wi-Fi', 'mouse, keyboard, YouTube', ['bad', 'no login at all']],
      ['Fleet Channel', 'Hub → each peer', 'the peer\'s admin password', 'describe, events; sends where opted in', ['warn', 'password in clear HTTP']],
      ['Peer describe', 'each peer', 'the Hub', 'that peer\'s own repos only', ['dim', 'not the fleet']],
      ['Fleet View', 'Hub', 'an Admin Session on the Hub', 'every machine and agent', ['dim', 'Hub only']],
      ['Remote transcripts', 'Hub → peer', 'the Arch only', 'any agent\'s transcript', ['dim', 'no screen shows them']],
      ['Hub IP gate', 'Hub', '192.168.0.0/24, named guests, device cookies', 'a chance to log in', ['warn', 'living room = other subnet']],
    ],
  },

  // ---- options: matrix of criteria × options ---------------------------------------------------------
  options: [
    { id: 'A', name: 'Living room proxies the Hub', how: 'The Living-room PC subscribes to the Hub (or to all 8 peers) and shows the fleet on its own Big Screen.' },
    { id: 'B', name: 'Projector shows the Hub as is', how: 'The projector browser logs into the Hub; the phone pairs with the Hub. Works today.' },
    { id: 'C', name: 'Sofa Viewer on the Hub', how: 'Like B, but with a Viewer Session: a short read-only route list, its own switch, LAN-only, 24 h.', pick: true },
    { id: 'D', name: 'Remote desktop of the Hub', how: 'Stream the Hub\'s Windows desktop to the projector with RDP or VNC.' },
    { id: 'E', name: 'Fleet Channel hygiene', how: 'Scoped per-peer tokens instead of admin passwords; shorter pairing. Complements any option.' },
  ],
  matrix: [
    // [criterion, A, B, C, D, E]  each cell = [rating good|mid|bad|na, text]
    ['Sofa sees the whole fleet', ['mid', 'needs a new Hub endpoint'], ['good', 'yes, today'], ['good', 'yes'], ['good', 'yes'], ['na', '—']],
    ['Sofa Phone holds', ['bad', 'Admin on the living room'], ['bad', 'Admin on the Hub'], ['good', 'Viewer on the Hub'], ['bad', 'the Hub\'s desktop'], ['na', '—']],
    ['Login kept in the room', ['mid', 'living-room admin, as today'], ['bad', 'Hub admin in the projector'], ['good', 'Viewer only'], ['bad', 'RDP credential'], ['na', '—']],
    ['New secrets on the Living-room PC', ['bad', '8 peer passwords or a Hub key'], ['good', 'none'], ['good', 'none'], ['bad', 'RDP credential'], ['good', 'removes passwords']],
    ['A stolen cookie can', ['bad', 'drive the living room + relay'], ['bad', 'everything on the Hub'], ['good', 'read the Fleet View'], ['bad', 'watch the whole desktop'], ['na', '—']],
    ['Code to write', ['bad', 'high · 2 repos'], ['good', 'none'], ['mid', 'medium · Hub only'], ['good', 'none · config'], ['mid', 'medium · every peer']],
    ['Path to sending prompts', ['bad', '3 hops, 2 gates'], ['bad', 'already full control'], ['good', 'second switch + allowlist'], ['bad', 'full control day one'], ['good', 'makes sends safe']],
    ['Verdict', ['bad', 'not first'], ['mid', 'right shape, only with C'], ['good', 'recommended'], ['bad', 'reject'], ['good', 'do before M2']],
  ],

  // ---- threat model of the recommended option -----------------------------------------------------
  threats: {
    cols: ['Threat', 'How it would happen', 'Control in C', 'Left over'],
    rows: [
      ['A guest\'s phone', 'joins the living-room Wi-Fi', 'Hub admits devices one by one; PIN read off the Big Screen; still only a Viewer', ['ok', 'none beyond reading']],
      ['Cookie theft', 'the LAN is plain HTTP', 'a Viewer cookie only reads; 24 h; revocable in Settings', ['warn', 'transcripts readable for ≤ 24 h']],
      ['View → send escalation', 'a route left off the deny list', 'deny by default: only listed routes pass; table-tested', ['ok', 'covered by tests']],
      ['Secrets on the projector', 'agents print tokens or e-mails', 'existing scrubbers on the relay; no account data or addresses in the Viewer view', ['warn', 'scrubbers are pattern-based']],
      ['Flooding the peers', 'a loop of transcript reads', 'rate limit per Viewer Session; audit log', ['ok', 'contained']],
      ['Hub reachable off-LAN', 'a proxy forward added later', 'Viewer refused outside the LAN ranges', ['warn', 'confirm: question 1']],
      ['Daljinski', 'anyone on the Wi-Fi, no login', 'not in the bridge path; C does not change it', ['bad', 'open: own card']],
      ['Peer passwords on the wire', 'the Fleet Channel', 'unchanged by C; option E replaces them', ['bad', 'open until E']],
    ],
  },

  // ---- plan ------------------------------------------------------------------------------------------
  phases: {
    cols: ['Phase', 'The sofa gets', 'Built where', 'Switches and controls', 'Done when'],
    rows: [
      ['Bridge', 'the projector can open any peer at its real address', 'no code: Tailscale on the Hub and the Living-room PC, one access rule (or port proxies + firewall)', 'one way · only the Living-room PC · only :5099', 'the PC opens 192.168.0.215:5099; nothing on 192.168.0.x can open 192.168.1.105'],
      ['M1', 'the whole fleet; any agent\'s transcript on the projector, read-only', 'Hub: Viewer Session, route allowlist, scrubbed Fleet View, transcript relay, Fleet Reader page, fleet list on /remote', '"Accept sofa viewers" (off by default) · LAN-only · 24 h · audit · rate limit', 'tap razvoj2016/prg → transcript on the projector; any send → 403'],
      ['M1b', 'the room points at the Hub', 'no code: projector browser opens the Fleet Reader as a Viewer', 'admit the PC and the phone one by one, never 192.168.1.0/24', 'no admin login left on the Living-room PC'],
      ['E', '—', 'every peer: scoped tokens instead of admin passwords', 'per-peer token, read vs send scopes', 'no peer password on the wire'],
      ['M2', 'type to agents on an allowlist', 'Hub: send gate, per-agent allowlist, confirm on the Big Screen', '"Sofa may send" (off) · the peer\'s accept-sends · audit · needs E', 'prompt arrives and is audited; deploy still 403'],
    ],
  },
  routes: {
    cols: ['Route', 'Purpose', 'M1 Viewer', 'M2 Viewer', 'Admin'],
    rows: [
      ['GET /api/arch/fleet/status', 'Fleet View (Viewer projection)', 'yes', 'yes', 'yes'],
      ['GET /api/arch/fleet/transcript', 'new: transcript relay', 'yes', 'yes', 'yes'],
      ['GET /api/dock', 'the Hub\'s own agents', 'yes', 'yes', 'yes'],
      ['GET/POST /api/remote/commands', 'drive the Big Screen', 'yes', 'yes', 'yes'],
      ['POST /api/remote/screens', 'Big Screen heartbeat', 'yes', 'yes', 'yes'],
      ['POST /api/chat, fleet send', 'type to an agent', 'no', 'gated', 'yes'],
      ['POST /api/remote/pair/new', 'mint a PIN', 'no', 'no', 'yes'],
      ['upgrade / provision / deploy', 'change machines', 'no', 'no', 'yes'],
      ['settings, gates, request approvals', 'change the Hub', 'no', 'no', 'yes'],
    ],
  },

  // ---- questions for the Operator ---------------------------------------------------------------------
  questions: {
    cols: ['#', 'Question', 'Why it matters', 'My proposal', 'Blocks'],
    rows: [
      ['1', 'Is the Hub reachable from the internet in any way?', 'Viewer Sessions must stay inside the house.', 'LAN-only; the Viewer is refused off-LAN.', 'M1'],
      ['2', 'Is 192.168.1.x a second segment of one router? Who else is on it?', 'Decides how the Hub admits the living room.', 'Admit the two devices one by one, never the subnet.', 'M1b'],
      ['3', 'Projector straight to the Hub, or via the Living-room PC?', 'Option C vs option A.', 'Straight to the Hub: no living-room code for M1.', 'M1'],
      ['4', 'What may a Viewer see?', 'The Fleet View carries account data and addresses.', 'Agents, states, transcripts. No accounts, usage or addresses.', 'M1'],
      ['5', 'How long should a sofa pairing last?', 'Shorter means less damage from a stolen cookie.', '24 h, re-pair with a PIN.', 'M1'],
      ['6', 'Which agents may the sofa type to? Confirm on screen?', 'Scope of M2.', 'A per-agent allowlist; confirm on the Big Screen.', 'M2'],
      ['7', 'Wait for the living-room leg of card 68090860?', 'That leg (WebView2 presenter) is still todo.', 'Go first with the projector browser.', '—'],
      ['8', 'Option E (scoped peer tokens) as its own card?', 'Peer passwords cross the LAN in clear.', 'Yes, before M2.', 'M2'],
      ['9', 'Is a Tailscale account acceptable, or must the bridge stay built-in Windows?', 'Tailscale keeps real addresses and encrypts; the built-in way needs link rewriting.', 'Tailscale, with one access rule.', 'Bridge'],
      ['10', 'Is the Hub\'s 192.168.0.138 fixed? You wrote 192.168.0.101.', 'The bridge and the peers\' views point at that address.', 'Reserve it in the router (DHCP reservation).', 'Bridge'],
      ['11', 'Should the projector get a Viewer Session on each peer, brokered by the Hub?', 'Without it, opening a peer means an admin login in the room.', 'Yes: the Hub mints viewer logins via the Fleet Channel, gated by each peer\'s opt-in.', 'M1'],
    ],
  },
};
