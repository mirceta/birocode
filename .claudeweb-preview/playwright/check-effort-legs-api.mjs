// openspec cross-repo-effort-legs — API-level check against an ISOLATED harness instance
// (launched by ../effort-legs-e2e.ps1): typed legs on a card (an agent leg with a role, an
// AGENTLESS leg by path), the role endpoint, the board carrying roles / paths / effort
// fields, a done-claim on a partially merged effort judged dishonest with every leg named,
// the verifier probing the agentless checkout, and the repo-agent MCP endpoint refusing a
// bad token while being exempt from the password gate.
//   PORT=<port> PW=<password> node check-effort-legs-api.mjs
import { mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const base = `http://127.0.0.1:${process.env.PORT || 5229}`;
const H = { 'X-Auth-Password': process.env.PW || '', 'Content-Type': 'application/json' };
const api = async (method, p, body, headers = H) => {
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, j };
};
const checks = {};
const ok = (k, v, detail) => { checks[k] = !!v; if (!v) console.log('FAIL', k, JSON.stringify(detail ?? '').slice(0, 600)); };

// An agentless checkout: a real git repo with a branch, so the verifier can probe it.
const copy = path.join(os.tmpdir(), 'cw-legs-' + Date.now(), 'prgcopies', 'copy1', 'prg');
mkdirSync(copy, { recursive: true });
execSync('git init -q && git config user.email a@b.c && git config user.name t && git commit -q --allow-empty -m init && git branch -M main && git checkout -q -b knjiga-poste && git commit -q --allow-empty -m work', { cwd: copy, stdio: 'ignore' });

const made = await api('POST', '/api/taskgraph/nodes', { title: 'Effort legs e2e', status: 'todo' });
ok('created', made.status === 200 && made.j?.id, made);
const id = made.j.id;
const repos = await api('GET', '/api/repos');
const repo = (repos.j || [])[0];
ok('aRepoExists', !!repo?.id, repos.j?.length);

const bad = await api('POST', `/api/taskgraph/nodes/${id}/legs`, { role: 'driver' });
ok('legNeedsRepoOrPath', bad.status === 400, bad);
const badRole = await api('POST', `/api/taskgraph/nodes/${id}/legs`, { repoId: repo.id, role: 'boss' });
ok('roleValidated', badRole.status === 400, badRole);
const driver = await api('POST', `/api/taskgraph/nodes/${id}/legs`, { repoId: repo.id, role: 'driver', branch: 'feat/driver', prUrl: 'https://github.com/mirceta/web-flow-autodev/pull/21' });
ok('driverLegAdded', driver.status === 200 && driver.j?.assignees?.length === 1 && driver.j.assignees[0].role === 'driver' && driver.j.assignees[0].branch === 'feat/driver', driver.j?.assignees);
const driven = await api('POST', `/api/taskgraph/nodes/${id}/legs`, { path: copy, role: 'driven', branch: 'knjiga-poste' });
const legs = driven.j?.assignees || [];
const agentless = legs.find((a) => a.path);
ok('agentlessLegByPath', driven.status === 200 && legs.length === 2 && agentless && agentless.repoId === `path:${copy}` && agentless.role === 'driven', legs);

const role = await api('POST', `/api/taskgraph/nodes/${id}/legs/role`, { key: agentless.key, role: null });
ok('roleCleared', role.status === 200 && role.j.assignees.find((a) => a.path).role == null, role.j?.assignees);
const role2 = await api('POST', `/api/taskgraph/nodes/${id}/legs/role`, { key: agentless.key, role: 'driven' });
ok('roleSetAgain', role2.status === 200 && role2.j.assignees.find((a) => a.path).role === 'driven', role2.j?.assignees);
const roleBad = await api('POST', `/api/taskgraph/nodes/${id}/legs/role`, { key: 'nope|nope', role: 'driver' });
ok('unknownLeg404', roleBad.status === 404, roleBad);

// The verifier: the agentless checkout is probed at its path (commits on its branch → committed).
const pass = await api('POST', '/api/taskgraph/verify');
const board = await api('GET', '/api/taskgraph');
const node = (board.j?.nodes || []).find((n) => n.id === id);
const legNow = node?.assignees?.find((a) => a.path);
ok('agentlessLegProbedAtItsPath', pass.status === 200 && legNow?.verifiedStatus === 'committed' && legNow?.headCommit, { notes: pass.j?.notes, legNow });
ok('boardCarriesRolesAndPaths', node?.assignees?.some((a) => a.role === 'driver') && node?.assignees?.some((a) => a.role === 'driven' && a.path === copy), node?.assignees);

// A done-claim off one leg: the card says done, the verdict names the unmerged leg.
// (Fake the driver as verified merged is not possible without GitHub; the mismatch rule
// needs a merged leg — so assert the partial rule on the pure API shape instead: a done
// claim with NO leg merged is the generic "ahead of the facts", never silently done.)
await api('PATCH', `/api/taskgraph/nodes/${id}`, { status: 'done' });
await api('POST', '/api/taskgraph/verify'); // the verdict is judged on the pass
const board2 = await api('GET', '/api/taskgraph');
const node2 = (board2.j?.nodes || []).find((n) => n.id === id);
const flagged = (board2.j?.integrity?.flagged || []).find((f) => f.id === id);
ok('doneClaimNeverSilentlyDone', node2?.status === 'done' && node2?.warning && /copy1\/prg: claimed done/.test(node2.warning) && flagged?.state === 'dishonest', { warning: node2?.warning, flagged });

// The repo-agent MCP endpoint: exempt from the password gate, guarded by its own bearer.
const mcpNoAuth = await fetch(`${base}/api/agents/mcp?repo=${repo.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
ok('agentMcpRefusesBadToken', mcpNoAuth.status === 401, mcpNoAuth.status);
const mcpWrong = await fetch(`${base}/api/agents/mcp?repo=${repo.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
ok('agentMcpRefusesWrongToken', mcpWrong.status === 401, mcpWrong.status);
const mcpGet = await fetch(`${base}/api/agents/mcp`, { method: 'GET' });
ok('agentMcpGetIs405', mcpGet.status === 405, mcpGet.status);

await api('DELETE', `/api/taskgraph/nodes/${id}`);
const passed = Object.values(checks).filter(Boolean).length;
console.log(JSON.stringify({ checks, passed, total: Object.keys(checks).length }, null, 1));
process.exit(passed === Object.keys(checks).length ? 0 : 1);
