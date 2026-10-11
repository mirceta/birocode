// Fleet topology model (openspec fleet-proxy): GET /api/arch/fleet/topology → the graph the
// Fleet topology tab draws. Pure, so it is unit-tested (fleetTopologyModel.test.mjs).
//
//   network      = one box per IPv4 /prefix range a fleet computer lives in
//   machine      = a fleet computer; inside its network, or BETWEEN networks when it has an
//                  address in more than one (the hub on home + business) — then one small
//                  interface node per network stands for it inside each box
//   fleet edge   = the arch's subscription to a peer (green answers / red does not)
//   proxy edge   = a proxy computer's one-way door: home side → business side
//   via edge     = a computer that proxies through a proxy computer → that computer's home side

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function ipToInt(ip) {
  const m = IPV4.exec(ip || '');
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
export function intToIp(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }

/** "192.168.0.42/24" → "192.168.0.0/24"; null when not IPv4. */
export function subnetOf(ip, prefix = 24) {
  const n = ipToInt(ip);
  if (n === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${intToIp((n & mask) >>> 0)}/${prefix}`;
}
export function inCidr(ip, cidr) {
  const [net, bits] = String(cidr || '').split('/');
  const n = ipToInt(ip); const base = ipToInt(net);
  if (n === null || base === null) return false;
  const b = bits === undefined ? 32 : Number(bits);
  const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
  return ((n & mask) >>> 0) === ((base & mask) >>> 0);
}
/** "http://192.168.0.42:5099" → "192.168.0.42"; host names come back as written. */
export function hostOf(address) {
  if (!address) return null;
  try { return new URL(/^[a-z]+:\/\//i.test(address) ? address : `http://${address}`).hostname; } catch { return null; }
}
const hostOfVia = (via) => (via ? String(via).replace(/:\d+$/, '') : null);

/** "192.168.0.0/24" → "192.168.0.x" for the usual /24, else the CIDR. */
export function networkLabel(cidr) {
  const [net, bits] = cidr.split('/');
  return bits === '24' ? `${net.replace(/\.0$/, '')}.x` : cidr;
}

const roleOf = (m) => m.proxy?.role || (m.proxy ? 'none' : 'unknown');

export function buildTopology(data) {
  const machines = (data?.machines || []).map((m, i) => ({ ...m, key: m.self ? 'self' : `m${i}:${m.sourceId || m.machine}` }));
  const warnings = [];

  // Every network someone dials, someone reports, or a proxy setting names.
  const dialSubnets = new Set();
  for (const m of machines) { const h = hostOf(m.address); const s = subnetOf(h); if (s) dialSubnets.add(s); }
  const namedRanges = new Set();
  for (const m of machines) {
    if (m.proxy?.role === 'proxy') { if (m.proxy.homeSubnet) namedRanges.add(m.proxy.homeSubnet); (m.proxy.targets || []).forEach((t) => namedRanges.add(t)); }
  }

  // Each machine's interfaces worth drawing: the one it is dialled on, plus those in a network
  // another computer shares or a proxy setting names (drops VPN / virtual adapters).
  for (const m of machines) {
    const reported = (m.proxy?.addresses || []).map((a) => { const [ip, p] = a.split('/'); return { ip, prefix: Number(p) || 24 }; })
      .filter((a) => ipToInt(a.ip) !== null);
    const dial = hostOf(m.address);
    const all = reported.length ? reported : (ipToInt(dial) !== null ? [{ ip: dial, prefix: 24 }] : []);
    let keep = all.filter((a) => a.ip === dial || dialSubnets.has(subnetOf(a.ip, a.prefix)) || [...namedRanges].some((r) => inCidr(a.ip, r)));
    if (!keep.length && all.length) keep = [all[0]];
    m.ifaces = keep.map((a) => ({ ...a, subnet: subnetOf(a.ip, a.prefix) }));
    m.dialHost = dial;
  }

  // Networks: from the interfaces, plus any range a proxy names.
  const netMap = new Map();
  const addNet = (cidr) => { if (cidr && !netMap.has(cidr)) netMap.set(cidr, { id: `net:${cidr}`, cidr, members: [], hints: [] }); return netMap.get(cidr); };
  machines.forEach((m) => m.ifaces.forEach((f) => addNet(f.subnet)));
  for (const m of machines) {
    if (m.proxy?.role !== 'proxy') continue;
    const home = addNet(m.proxy.homeSubnet); if (home) home.hints.push(`home side of ${m.machine}`);
    (m.proxy.targets || []).forEach((t) => { const n = addNet(t); if (n) n.hints.push(`business side, reached through ${m.machine}`); });
  }

  const nodes = []; const edges = [];
  // anchor(machine, subnet): the node that stands for the machine inside that network.
  const anchors = new Map();
  const anchor = (m, cidr) => anchors.get(`${m.key}|${cidr}`) || null;
  const roleText = (m) => {
    const r = roleOf(m);
    if (r === 'proxy') return '⇄ proxy computer';
    if (r === 'client') return `↗ proxies through ${m.proxy.via}`;
    if (r === 'unknown') return 'older build: role unknown';
    return null;
  };
  for (const m of machines) {
    const lines = [m.machine + (m.self ? ' · 🏛 arch' : '')];
    const rt = roleText(m); if (rt) lines.push(rt);
    const info = [
      ['Computer', m.machine], ['Arch', m.self ? 'yes: this hub runs the arch' : 'no'],
      ['Dialled at', m.self ? '(this computer)' : m.address || '—'],
      ['Answers', m.self ? 'yes' : m.reachable ? 'yes' : `no (${m.status || 'unreachable'})`],
      ['Addresses', m.ifaces.map((f) => `${f.ip}/${f.prefix}`).join(', ') || '—'],
      ['Proxy role', roleOf(m) === 'proxy' ? `proxy computer: ${m.proxy.homeSubnet} → ${(m.proxy.targets || []).join(', ')}, for ${(m.proxy.allowClients || []).join(', ')}`
        : roleOf(m) === 'client' ? `proxies through ${m.proxy.via} for ${(m.proxy.targets || []).join(', ')}`
          : roleOf(m) === 'unknown' ? 'unknown: this computer runs a build without proxy settings' : 'none'],
      ['Build', m.version || '—'],
    ];
    const cls = [m.self ? 'self' : '', !m.self && !m.reachable ? 'down' : '', roleOf(m) === 'proxy' ? 'proxy' : '', roleOf(m) === 'client' ? 'client' : '', roleOf(m) === 'unknown' ? 'old' : ''].filter(Boolean).join(' ');
    if (m.ifaces.length > 1) {
      nodes.push({ id: m.key, label: lines.join('\n'), kind: 'machine', parent: null, classes: `${cls} multi`, info });
      for (const f of m.ifaces) {
        const id = `if:${m.key}:${f.ip}`;
        nodes.push({ id, label: `${m.machine}\n${f.ip}`, kind: 'iface', parent: `net:${f.subnet}`, classes: `iface ${cls}`, info: [['Interface of', m.machine], ['Address', `${f.ip}/${f.prefix}`], ...info.slice(5)] });
        edges.push({ id: `nic:${id}`, source: m.key, target: id, kind: 'nic', label: '' });
        anchors.set(`${m.key}|${f.subnet}`, id);
        netMap.get(f.subnet).members.push(id);
      }
    } else {
      const f = m.ifaces[0];
      const parent = f ? `net:${f.subnet}` : null;
      nodes.push({ id: m.key, label: lines.concat(f ? [f.ip] : []).join('\n'), kind: 'machine', parent, classes: cls, info });
      if (f) { anchors.set(`${m.key}|${f.subnet}`, m.key); netMap.get(f.subnet).members.push(m.key); }
    }
  }

  const older = machines.filter((m) => !m.self && roleOf(m) === 'unknown').map((m) => m.machine);
  if (older.length) warnings.push(`Older build, proxy role unknown until upgraded: ${older.join(', ')}.`);

  // Fleet subscriptions: the arch → each peer, inside the network the hub dials it on.
  const self = machines.find((m) => m.self);
  for (const m of machines) {
    if (m.self || !self) continue;
    const sub = subnetOf(m.dialHost);
    const from = (sub && anchor(self, sub)) || self.key;
    const to = (sub && anchor(m, sub)) || m.key;
    edges.push({ id: `fleet:${m.key}`, source: from, target: to, kind: m.reachable ? 'fleet' : 'fleetdown', label: '',
      info: [['Link', `the arch on ${self.machine} polls ${m.machine}`], ['Address', m.address || '—'], ['Answers', m.reachable ? 'yes' : `no (${m.status})`], ['Sends', m.acceptsSends ? 'accepted' : 'not accepted']] });
  }

  // Proxy computers: their one-way door, and who goes through it.
  const ghosts = new Map();
  const ghost = (ip, why) => {
    const sub = subnetOf(ip); const net = addNet(sub);
    const id = `ghost:${ip}`;
    if (!ghosts.has(id)) {
      ghosts.set(id, true);
      nodes.push({ id, label: `${ip}\nnot a fleet computer`, kind: 'ghost', parent: net ? net.id : null, classes: 'ghost', info: [['Address', ip], ['Seen because', why]] });
      if (net) net.members.push(id);
    }
    return id;
  };
  const machineByIp = (ip) => machines.find((x) => x.ifaces.some((f) => f.ip === ip) || x.dialHost === ip);
  for (const m of machines) {
    if (roleOf(m) !== 'proxy') continue;
    const home = m.proxy.homeSubnet;
    const homeAnchor = anchor(m, home) || m.key;
    for (const t of m.proxy.targets || []) {
      const targetAnchor = anchor(m, t) || `net:${t}`;
      edges.push({ id: `proxy:${m.key}:${t}`, source: homeAnchor, target: targetAnchor, kind: 'proxy', label: `proxy → ${networkLabel(t)}`,
        info: [['Proxy computer', m.machine], ['Home side', home], ['Business side', t], ['Allowed', (m.proxy.allowClients || []).join(', ') || 'nobody'], ['Direction', 'one way: the business side cannot reach the home side through it']] });
    }
    for (const c of m.proxy.allowClients || []) {
      const cm = machineByIp(c);
      if (cm && roleOf(cm) === 'client') continue; // drawn from the client's side below
      const from = cm ? (anchor(cm, subnetOf(c)) || cm.key) : ghost(c, `allowed to use ${m.machine}`);
      if (from === homeAnchor) continue; // the proxy computer itself: no loop
      edges.push({ id: `allow:${m.key}:${c}`, source: from, target: homeAnchor, kind: 'allowed', label: 'allowed',
        info: [['Allowed client', c], ['Proxy computer', m.machine], ['Uses it', cm ? 'not set to proxy through it' : 'unknown: not a fleet computer']] });
    }
  }
  for (const m of machines) {
    if (roleOf(m) !== 'client') continue;
    const viaIp = hostOfVia(m.proxy.via);
    const pm = machineByIp(viaIp);
    const from = anchor(m, subnetOf(viaIp)) || m.key;
    const to = pm ? (anchor(pm, subnetOf(viaIp)) || pm.key) : ghost(viaIp, `${m.machine} proxies through it`);
    edges.push({ id: `via:${m.key}`, source: from, target: to, kind: 'via', label: 'proxies through',
      info: [['Computer', m.machine], ['Through', m.proxy.via], ['For', (m.proxy.targets || []).join(', ')]] });
    if (!pm) warnings.push(`${m.machine} proxies through ${m.proxy.via}, which is not a fleet computer the arch knows.`);
    else if (roleOf(pm) !== 'proxy') warnings.push(`${m.machine} proxies through ${pm.machine}, but ${pm.machine} is not set as a proxy computer.`);
    else {
      const myIps = m.ifaces.map((f) => f.ip).concat(m.dialHost ? [m.dialHost] : []);
      if (!myIps.some((ip) => (pm.proxy.allowClients || []).includes(ip))) warnings.push(`${m.machine} proxies through ${pm.machine}, but ${pm.machine} does not allow ${myIps.join(' / ')}.`);
    }
  }

  // Networks + layout: one column per network (most members first), the multi-homed machines above.
  const networks = [...netMap.values()].sort((a, b) => b.members.length - a.members.length || a.cidr.localeCompare(b.cidr));
  const pos = {};
  const COL = 820;
  networks.forEach((n, i) => {
    const x0 = i * COL;
    if (!n.members.length) { const id = `empty:${n.cidr}`; nodes.push({ id, label: 'no fleet computer\nseen here', kind: 'empty', parent: n.id, classes: 'empty', info: [['Network', n.cidr]] }); n.members.push(id); }
    // Interfaces of multi-homed machines first (top row), then the rest in a 2-wide grid.
    const ifs = n.members.filter((id) => id.startsWith('if:'));
    const rest = n.members.filter((id) => !id.startsWith('if:'));
    ifs.forEach((id, j) => { pos[id] = { x: x0 + 130 + j * 250, y: 0 }; });
    const across = rest.length > 4 ? 3 : 2;
    rest.forEach((id, j) => { pos[id] = { x: x0 + (j % across) * 240, y: (ifs.length ? 150 : 0) + Math.floor(j / across) * 110 }; });
  });
  for (const nd of nodes) {
    if (nd.kind !== 'machine' || nd.parent) continue;
    const kids = nodes.filter((x) => x.id.startsWith(`if:${nd.id}:`)).map((x) => pos[x.id]).filter(Boolean);
    pos[nd.id] = kids.length ? { x: kids.reduce((s, p) => s + p.x, 0) / kids.length, y: -190 } : { x: -300, y: 0 };
  }
  const netNodes = networks.map((n) => ({ id: n.id, label: `${networkLabel(n.cidr)}${n.hints.length ? ` · ${[...new Set(n.hints)].join(' · ')}` : ''}`, kind: 'network', parent: null, classes: 'network',
    info: [['Network', n.cidr], ['Computers', String(n.members.filter((id) => !id.startsWith('empty:')).length)], ...(n.hints.length ? [['Role', [...new Set(n.hints)].join('; ')]] : [])] }));

  return { networks, nodes: [...netNodes, ...nodes], edges, positions: pos, warnings };
}

/** A stable signature: the graph is rebuilt only when this changes. */
export function topologySignature(model) {
  return JSON.stringify([model.nodes.map((n) => [n.id, n.label, n.classes, n.parent]), model.edges.map((e) => [e.id, e.kind, e.source, e.target])]);
}
