import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology, subnetOf, inCidr, hostOf, networkLabel } from './fleetTopologyModel.js';

// The fleet as of 2026-10-10: the hub on business (0.x) + home (1.x), peers on business,
// the living-room computer on home.
const hub = { machine: 'HUB', self: true, reachable: true, arch: true, version: 'v1',
  proxy: { role: 'proxy', homeSubnet: '192.168.1.0/24', allowClients: ['192.168.1.105'], targets: ['192.168.0.0/24'], addresses: ['192.168.0.138/24', '192.168.1.101/24', '172.20.0.1/20'] } };
const p42 = { machine: 'laptop', sourceId: 's42', address: 'http://192.168.0.42:5099', reachable: true, status: 'ok', proxy: { role: 'none', addresses: ['192.168.0.42/24', '10.8.0.2/24'] } };
const p215 = { machine: 'spacex', sourceId: 's215', address: 'http://192.168.0.215:5099', reachable: false, status: 'unreachable', proxy: null };
const lr = { machine: 'living room', sourceId: 'slr', address: 'http://192.168.1.105:5099', reachable: true, status: 'ok',
  proxy: { role: 'client', via: '192.168.1.101:5099', targets: ['192.168.0.0/24'], addresses: ['192.168.1.105/24'] } };

test('helpers', () => {
  assert.equal(subnetOf('192.168.0.42'), '192.168.0.0/24');
  assert.equal(inCidr('192.168.1.105', '192.168.1.0/24'), true);
  assert.equal(inCidr('192.168.0.5', '192.168.1.0/24'), false);
  assert.equal(hostOf('http://192.168.0.42:5099'), '192.168.0.42');
  assert.equal(networkLabel('192.168.0.0/24'), '192.168.0.x');
});

test('two networks, the hub between them, virtual adapters dropped', () => {
  const t = buildTopology({ machines: [hub, p42, p215, lr] });
  assert.deepEqual(t.networks.map((n) => n.cidr), ['192.168.0.0/24', '192.168.1.0/24']);
  const self = t.nodes.find((n) => n.id === 'self');
  assert.equal(self.parent, null, 'multi-homed hub sits outside the boxes');
  const ifaces = t.nodes.filter((n) => n.kind === 'iface').map((n) => n.parent).sort();
  assert.deepEqual(ifaces, ['net:192.168.0.0/24', 'net:192.168.1.0/24']);
  assert.ok(!t.nodes.some((n) => /172\.20|10\.8/.test(n.label)), 'VPN / virtual adapters are not drawn');
});

test('fleet edges start at the hub interface on the peer network; red when the peer does not answer', () => {
  const t = buildTopology({ machines: [hub, p42, p215, lr] });
  const toLr = t.edges.find((e) => e.kind === 'fleet' && e.target.endsWith(':slr'));
  assert.equal(toLr.source, 'if:self:192.168.1.101');
  const down = t.edges.find((e) => e.target.endsWith(':s215'));
  assert.equal(down.kind, 'fleetdown');
});

test('proxy door and the client going through it, no warnings when the settings agree', () => {
  const t = buildTopology({ machines: [hub, p42, lr] });
  const door = t.edges.find((e) => e.kind === 'proxy');
  assert.equal(door.source, 'if:self:192.168.1.101');
  assert.equal(door.target, 'if:self:192.168.0.138');
  const via = t.edges.find((e) => e.kind === 'via');
  assert.equal(via.target, 'if:self:192.168.1.101');
  assert.ok(!t.edges.some((e) => e.kind === 'allowed'), 'the allowed client is drawn once, from its own side');
  assert.deepEqual(t.warnings, []);
  assert.match(t.nodes.find((n) => n.id === 'net:192.168.1.0/24').label, /home side of HUB/);
});

test('warnings: client through a non-proxy, not allowed, and an older build', () => {
  const plainHub = { ...hub, proxy: { role: 'none', addresses: hub.proxy.addresses } };
  const t1 = buildTopology({ machines: [plainHub, lr] });
  assert.ok(t1.warnings.some((w) => /not set as a proxy computer/.test(w)));
  const strictHub = { ...hub, proxy: { ...hub.proxy, allowClients: ['192.168.1.50'] } };
  const t2 = buildTopology({ machines: [strictHub, lr] });
  assert.ok(t2.warnings.some((w) => /does not allow 192\.168\.1\.105/.test(w)));
  assert.ok(t2.nodes.some((n) => n.id === 'ghost:192.168.1.50'), 'an allowed address that is no fleet computer is drawn as such');
  const t3 = buildTopology({ machines: [hub, p215] });
  assert.ok(t3.warnings.some((w) => /Older build.*spacex/.test(w)));
});

test('a fleet with no proxy: one network, everyone inside it', () => {
  const soloHub = { machine: 'HUB', self: true, reachable: true, proxy: { role: 'none', addresses: ['192.168.0.138/24'] } };
  const t = buildTopology({ machines: [soloHub, p42] });
  assert.equal(t.networks.length, 1);
  assert.equal(t.nodes.find((n) => n.id === 'self').parent, 'net:192.168.0.0/24');
  assert.equal(t.edges.filter((e) => e.kind === 'fleet').length, 1);
});
