// openspec provision-repo-agent (fleet task 3bbd2242): the whole provisioning end-to-end on
// TWO isolated instances of this build on this box — a HUB subscribed to a PEER (label
// PEERBOX). The hub's provision_repo_agent path (POST /api/arch/fleet/provision = the tool
// minus the armed rule) is driven against the peer and against self; the peer's opt-in gate,
// the URL rules, idempotency, the folder conflict and the hub-scope add are asserted on the
// real answers. The throwaway checkout is a small PUBLIC repo cloned under the test name;
// the script removes every registration again at the end and prints the by-hand recipe.
import fs from 'node:fs';

const HUB = `http://127.0.0.1:${process.env.HUB_PORT || '5242'}`;
const PEER = `http://127.0.0.1:${process.env.PEER_PORT || '5241'}`;
const HUB_PW = process.env.HUB_PW || 'iso-prov-hub';
const PEER_PW = process.env.PEER_PW || 'iso-prov-peer';
const URL = process.env.PROV_URL || 'https://github.com/mirceta/portlistener.git';
const NAME = process.env.PROV_NAME || 'provision-test-20261007';
const OUT = process.env.PROV_OUT || 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/provision-e2e-result.json';

const mk = (base, pw) => {
  const H = { 'Content-Type': 'application/json', 'X-Auth-Password': pw };
  const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
  return {
    get: (p) => fetch(base + p, { headers: H }).then(j),
    post: (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) }).then(j),
    del: (p) => fetch(base + p, { method: 'DELETE', headers: H }).then(j),
  };
};
const hub = mk(HUB, HUB_PW), peer = mk(PEER, PEER_PW);
const checks = {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const check = (name, ok, detail) => { checks[name] = !!ok; log(ok ? 'PASS' : 'FAIL', name, detail ? '| ' + String(detail).slice(0, 400) : ''); return !!ok; };
const replies = {};

try {
  // ---- 0. the fleet: hub subscribes to the peer, allows sends ------------------------------
  const src = await hub.post('/api/collector/sources', { address: PEER, label: 'PEERBOX', credential: PEER_PW });
  check('hub subscribed to the peer as PEERBOX', src.status === 200 && src.body?.id, JSON.stringify(src.body).slice(0, 200));
  const SRC = src.body.id;
  const sends = await hub.post(`/api/collector/sources/${SRC}/sends`, { allow: true });
  check('hub allows sends to PEERBOX', sends.status === 200 && sends.body?.allowSends === true);

  // ---- 1. the opt-in is off by default, and the hub says so before dialling -----------------
  let ps = await peer.get('/api/arch');
  check('peer: acceptProvisioning is off by default', ps.body?.fleet?.acceptProvisioning === false);
  let d = await peer.get('/api/arch/peer');
  check('peer describe reports acceptsProvisioning=false', d.body?.acceptsProvisioning === false);
  let direct = await peer.post('/api/arch/peer/provision', { from: 'test-hub', url: URL, name: NAME });
  check('peer refuses a fleet provisioning while opted out (not-accepting)', direct.body?.status === 'not-accepting', direct.body?.detail);
  let hs = await hub.get('/api/arch');
  const peerRow = (hs.body?.fleet?.sources || []).find((s) => s.id === SRC);
  check('hub state shows PEERBOX acceptsProvisioning=false', peerRow?.peer?.acceptsProvisioning === false, JSON.stringify(peerRow?.peer || {}).slice(0, 200));
  let r = await hub.post('/api/arch/fleet/provision', { sourceId: SRC, url: URL, name: NAME });
  replies.notAccepting = r.body;
  check('hub tool answers not-accepting for an opted-out peer', r.body?.status === 'not-accepting' && /accept fleet provisioning/.test(r.body?.detail || ''), r.body?.detail);

  // ---- 2. the opt-in ----------------------------------------------------------------------------
  const opt = await peer.post('/api/arch/fleet', { acceptProvisioning: true });
  check('peer opt-in toggles via POST /arch/fleet', opt.status === 200 && opt.body?.fleet?.acceptProvisioning === true);
  // A real fleet peer accepts sends already; without it the new agent is provisioned but the
  // row honestly says "not sendable yet: PEERBOX does not accept fleet sends".
  const optSends = await peer.post('/api/arch/fleet', { acceptSends: true });
  check('peer accepts fleet sends (so the new agent can be sendable)', optSends.body?.fleet?.acceptSends === true);
  d = await peer.get('/api/arch/peer');
  check('peer describe reports acceptsProvisioning=true', d.body?.acceptsProvisioning === true);

  // ---- 3. the URL rules: a token in the URL is refused, on the peer and on self ----------------
  r = await hub.post('/api/arch/fleet/provision', { sourceId: SRC, url: 'https://x-access-token:ghp_notreal@github.com/mirceta/portlistener.git', name: NAME });
  replies.badUrl = r.body;
  check('token-in-URL is refused by the peer (bad-url), nothing cloned', r.body?.status === 'bad-url' && /credentials/.test(r.body?.detail || ''), r.body?.detail);
  check('the refusal never echoes the token', !JSON.stringify(r.body).includes('ghp_notreal'));
  r = await hub.post('/api/arch/fleet/provision', { url: 'git@github.com:mirceta/portlistener', name: NAME, parentFolder: 'C:\\no\\such\\folder\\here' });
  check('self: a missing parentFolder is a named error', r.status === 200 && r.body?.ok === false && /parentFolder does not exist/.test(r.body?.detail || ''), r.body?.detail);

  // ---- 4. the real thing: hub → peer ---------------------------------------------------------------
  const t0 = Date.now();
  r = await hub.post('/api/arch/fleet/provision', { sourceId: SRC, url: URL, name: NAME });
  replies.provisioned = r.body;
  log('provision on PEERBOX took', Date.now() - t0, 'ms →', r.body?.status, '-', r.body?.detail);
  const dd = r.body?.data || {};
  check('hub → peer: provisioned', r.body?.ok === true && r.body?.status === 'provisioned', r.body?.detail);
  const steps = dd.provisioned?.steps || [];
  check('every step done: clone, project, agent, scope', ['clone', 'project', 'agent', 'scope'].every((n) => steps.find((s) => s.step === n)?.status === 'done'), JSON.stringify(steps).slice(0, 400));
  check('reply names the handle PEERBOX/<name>', dd.handle === `PEERBOX/${NAME}`, dd.handle);
  check('reply carries the resulting list_agents row', dd.agent && dd.agent.handle === `PEERBOX/${NAME}`, JSON.stringify(dd.agent || {}).slice(0, 400));
  check('row: managedThere=true, sendable=true, on its default branch, clean', dd.agent?.managedThere === true && dd.agent?.sendable === true && dd.agent?.branch === dd.agent?.defaultBranch && dd.agent?.dirty === false, JSON.stringify({ b: dd.agent?.branch, d: dd.agent?.defaultBranch, dirty: dd.agent?.dirty, av: dd.agent?.availability }));
  check('row: availability available', dd.agent?.availability === 'available', dd.agent?.availability);
  check('reply says it was added to the hub scope', dd.addedToHubScope === true);
  const KEY = `${SRC}/${dd.repoId}`;
  hs = await hub.get('/api/arch');
  check('hub scope (managedFleet) now holds the new agent', (hs.body?.managedFleet || []).includes(KEY), JSON.stringify(hs.body?.managedFleet));
  ps = await peer.get('/api/arch');
  check('peer scope (managedRepoIds) now holds the new repo', (ps.body?.managedRepoIds || []).includes(dd.repoId));
  const prepos = await peer.get('/api/repos');
  const prepo = (prepos.body || []).find((x) => x.id === dd.repoId);
  check('peer registered the project at the sibling path', prepo && /playground[\\/]provision-test-20261007$/.test(prepo.path || ''), prepo?.path);
  const pdock = await peer.get('/api/dock');
  check('peer opened the agent dock for it', (pdock.body || []).some((t) => t.repoId === dd.repoId));
  const la = await hub.get('/api/arch/fleet/status');
  const machine = (la.body?.machines || []).find((m) => m.sourceId === SRC);
  const agent = (machine?.agents || []).find((a) => a.repoId === dd.repoId);
  check('hub Fleet Status lists it on PEERBOX, managed there, docked', agent && agent.managed === true && agent.docked === true, JSON.stringify(agent || {}).slice(0, 300));
  check('hub Fleet Status shows PEERBOX acceptsProvisioning=true', machine?.acceptsProvisioning === true);

  // ---- 5. idempotent -------------------------------------------------------------------------------
  r = await hub.post('/api/arch/fleet/provision', { sourceId: SRC, url: URL, name: NAME });
  replies.exists = r.body;
  const s2 = r.body?.data?.provisioned?.steps || [];
  check('second call answers exists, every step reused, nothing duplicated', r.body?.ok === true && r.body?.status === 'exists' && s2.length === 4 && s2.every((s) => s.status === 'reused') && r.body?.data?.addedToHubScope === false, JSON.stringify(s2).slice(0, 300));
  const prepos2 = await peer.get('/api/repos');
  check('peer still has exactly one registration for it', (prepos2.body || []).filter((x) => x.id === dd.repoId || (x.name === NAME)).length === 1);
  const pdock2 = await peer.get('/api/dock');
  check('peer still has exactly one dock for it', (pdock2.body || []).filter((t) => t.repoId === dd.repoId).length === 1);
  r = await hub.post('/api/arch/fleet/provision', { sourceId: SRC, url: 'https://github.com/mirceta/c.git', name: NAME });
  replies.conflict = r.body;
  check('same folder, other repo → folder-conflict', r.body?.status === 'folder-conflict' && /checkout of/.test(r.body?.detail || ''), r.body?.detail);

  // ---- 6. the same on self (the hub itself), and the plain harness route ---------------------------
  r = await hub.post('/api/arch/fleet/provision', { url: URL, name: NAME });
  replies.self = r.body;
  const sd = r.body?.data || {};
  const ss = sd.provisioned?.steps || [];
  check('self: the existing checkout is reused and the agent registered here', r.body?.ok === true && ss.find((s) => s.step === 'clone')?.status === 'reused' && ss.find((s) => s.step === 'project')?.status === 'done' && ss.find((s) => s.step === 'agent')?.status === 'done' && ss.find((s) => s.step === 'scope')?.status === 'done', JSON.stringify(ss).slice(0, 300));
  check('self: the reply row is local, sendable, managedThere', sd.agent?.managedThere === true && sd.agent?.sendable === true && sd.machine && sd.handle?.endsWith(`/${NAME}`), JSON.stringify(sd.agent || {}).slice(0, 300));
  const alias = await peer.post('/api/fleet/provision-repo', { url: URL, name: NAME });
  check('POST /api/fleet/provision-repo on the peer (its own operator) answers exists', alias.body?.ok === true && alias.body?.status === 'exists', alias.body?.detail);

  // ---- 7. the tool is in the arch's catalogue, documented in its CLAUDE.md ----------------------------
  const tools = await hub.get('/api/arch/tools');
  const tool = (tools.body?.tools || []).find((t) => t.name === 'provision_repo_agent');
  check('provision_repo_agent is in the arch tool catalogue', !!tool && /list_agents row/.test(tool.description || ''));
  check('the tool was audited on the hub', (tool?.calls || 0) >= 3, tool?.calls);

  // ---- 8. remove the test agent again (the by-hand recipe, as the brief asks) ------------------------
  const rm = {};
  rm.hubScope = await hub.post('/api/arch/scope', { repoIds: [], fleet: [] });
  const hubRepos = await hub.get('/api/repos');
  const mine = (hubRepos.body || []).find((x) => x.name === NAME);
  const hubDock = await hub.get('/api/dock');
  for (const t of (hubDock.body || []).filter((t) => mine && t.repoId === mine.id)) rm.hubDock = await hub.del(`/api/dock/${t.id}`);
  if (mine) rm.hubRepo = await hub.del(`/api/repos/${mine.id}`);
  rm.peerScope = await peer.post('/api/arch/scope', { repoIds: (ps.body?.managedRepoIds || []).filter((id) => id !== dd.repoId) });
  for (const t of (pdock2.body || []).filter((t) => t.repoId === dd.repoId)) rm.peerDock = await peer.del(`/api/dock/${t.id}`);
  rm.peerRepo = await peer.del(`/api/repos/${dd.repoId}`);
  const after = await peer.get('/api/repos');
  check('removed again: peer no longer registers the test repo', !(after.body || []).some((x) => x.id === dd.repoId));
  const hsAfter = await hub.get('/api/arch');
  check('removed again: hub scope no longer holds it', !(hsAfter.body?.managedFleet || []).includes(KEY));
  replies.removed = Object.fromEntries(Object.entries(rm).map(([k, v]) => [k, v?.status]));
  replies.checkoutPath = prepo?.path;
} catch (e) {
  log('ERROR', e?.stack || e);
  checks['script ran to the end'] = false;
}

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
fs.writeFileSync(OUT, JSON.stringify({ checks, failed, replies }, null, 2));
console.log(JSON.stringify({ passed: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length, failed }, null, 1));
process.exit(failed.length === 0 ? 0 : 1);
