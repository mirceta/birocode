// Dual-stack server for the OpenSpec-port Control Room — a dedicated
// `kind: repo` Local app (distinct from the harness-served Understanding app).
//
// Satisfies the three-rule Local-exposure contract (docs/local-exposure-convention.md):
//   • Dual-stack bind — listen on :: with dualstack ON → answers on 127.0.0.1 and [::1].
//   • Serve at root — GET / returns index.html.
//   • Relative URLs — index.html references ./app.js etc., resolving under the proxy sub-path.
//
// Beyond static files it exposes a small, STRICTLY-WHITELISTED exec API so the
// Console tab can drive real OpenSpec/git actions in the repo:
//   • POST ./api/exec  { action, id? }  → runs one whitelisted verb, returns
//                                          { ok, code, cmd, stdout, stderr }.
// Only fixed verbs run (server builds the argv; the client never sends a command
// string), dynamic tokens are regex-sanitised, and everything runs in the repo
// root bound to loopback only. This is the local-app equivalent of typing the
// command yourself — it does NOT add an enforcement gate (that lives in CI).
//
// It also exposes a READ-ONLY pair for the Cockpit tab (the inspect-twin of the
// Console's run) — these only read state, and add NO new mutating verb:
//   • GET ./api/cockpit            → { activeChanges, specs, archived, errors }
//                                     (openspec list --json + spec list --json +
//                                      validate --all --strict --json stamped onto
//                                      each item as {valid,issues} + a direct read
//                                      of openspec/changes/archive/). Each active
//                                      change also carries touches:[{spec,operations}]
//                                      — the baseline caps its deltas edit, so the
//                                      Cockpit can draw the change↔baseline cross-link.
//   • GET ./api/cockpit/show?id=…  → openspec show <id> --json (id SAFE_NAME-gated),
//                                     plus the tasks.md / proposal.md / design.md
//                                     artifacts show --json omits.
//   • GET ./api/cockpit/archived?id=… → an archived change parsed straight from
//                                     openspec/changes/archive/<id>/ (the CLI can't
//                                     show archives), in the same drill-in shape.
//
// Run:  node serve.mjs                                   (port 5310; inspects the repo this app sits in)
//       PORT=1234 node serve.mjs                         (any other port)
//       OPENSPEC_REPO_ROOT=C:\path\to\repo node serve.mjs (default target = ANY repo, no copy)
// The Cockpit tab can also override the target per request via a `root` textbox —
// no restart; the env var / app-parent is just the pre-filled default.
// No dependencies — Node's built-in http/fs/child_process only.

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));     // openspec-port-app/
// The repo this Control Room inspects, by precedence: a per-request `root` from
// the Cockpit UI (see resolveRoot), then OPENSPEC_REPO_ROOT set at launch, then
// the folder that CONTAINS this app (so a copy dropped into a repo "just works").
// One running instance can thus point at any repo on the host — env var at launch
// OR typed into the Cockpit at runtime, no restart. Stays a fully independent
// local app; the target is configuration, not code.
const DEFAULT_ROOT = process.env.OPENSPEC_REPO_ROOT || dirname(ROOT);

// Resolve the repo a single request targets. Empty → the launch default (trusted,
// no check). A supplied path must be an existing directory; anything else is a
// clean userFacing error so the UI never silently reads the wrong place. Loopback
// only and operator-driven, so an arbitrary existing dir is acceptable — the same
// trust the env var already granted; we only reject non-directories.
async function resolveRoot(raw) {
  const v = String(raw || '').trim();
  if (!v) return DEFAULT_ROOT;
  let st;
  try { st = await stat(v); }
  catch {
    const err = new Error(`repo root not found: "${v}"`);
    err.userFacing = true;
    throw err;
  }
  if (!st.isDirectory()) {
    const err = new Error(`repo root is not a directory: "${v}"`);
    err.userFacing = true;
    throw err;
  }
  return normalize(v);
}
const PORT = Number(process.env.PORT) || 5310;
const EXEC_TIMEOUT_MS = 30_000;
const EXEC_MAXBUF = 4 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ── Exec whitelist ───────────────────────────────────────────────
// Each entry maps an action id → an argv array. The client may only pick a key
// and (where noted) supply `id`, which is sanitised before it reaches argv.
// Nothing the client sends becomes a verb or a flag.
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;            // change / spec ids
function reqName(raw) {
  const v = String(raw || '').trim();
  if (!SAFE_NAME.test(v)) {
    const err = new Error(`invalid id "${v}" — use lowercase letters, digits and dashes`);
    err.userFacing = true;
    throw err;
  }
  return v;
}

const ACTIONS = {
  version:           ()  => ['openspec', '--version'],
  list:              ()  => ['openspec', 'list'],
  'list-specs':      ()  => ['openspec', 'list', '--specs'],
  validate:          ()  => ['openspec', 'validate'],
  'validate-strict': ()  => ['openspec', 'validate', '--strict'],
  show:              (a) => ['openspec', 'show', reqName(a.id)],
  status:            (a) => ['openspec', 'status', '--change', reqName(a.id)],
  'new-change':      (a) => ['openspec', 'new', 'change', reqName(a.id)],
  archive:           (a) => ['openspec', 'archive', reqName(a.id)],
  init:              ()  => ['openspec', 'init', '--tools', 'claude'],
  update:            ()  => ['openspec', 'update'],
  'git-status':      ()  => ['git', 'status', '--short', '--branch'],
};

function runExec(argv, cwd = DEFAULT_ROOT) {
  return new Promise((resolve) => {
    const [file, ...args] = argv;
    // shell:true so Windows resolves npm shims (openspec.cmd / git.cmd). Safe
    // because every token is a server constant or a SAFE_NAME-validated id.
    execFile(
      file, args,
      { cwd, timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAXBUF, shell: true, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === 'number' ? err.code : (err ? 1 : 0);
        let extra = '';
        if (err && err.killed) extra = `\n[timed out after ${EXEC_TIMEOUT_MS / 1000}s]`;
        else if (err && err.code === 'ENOENT') extra = `\n[command not found: ${file} — is it installed / on PATH?]`;
        resolve({
          ok: code === 0,
          code,
          cmd: argv.join(' '),
          stdout: String(stdout || ''),
          stderr: String(stderr || '') + extra,
        });
      },
    );
  });
}

// ── Cockpit: read-only state aggregation ─────────────────────────
// Runs a whitelisted argv and parses its stdout as JSON. Returns the parsed
// value plus the raw exec result so callers can surface a clean error.
async function execJson(argv, cwd = DEFAULT_ROOT) {
  const r = await runExec(argv, cwd);
  let json = null, parseError = null;
  if (r.stdout) { try { json = JSON.parse(r.stdout); } catch (e) { parseError = e.message; } }
  return { ok: r.ok && json != null, code: r.code, cmd: r.cmd, json, stderr: r.stderr, parseError };
}

// Shipped changes have no CLI listing — read openspec/changes/archive/ directly.
// Each entry is a `YYYY-MM-DD-<slug>` folder; date = prefix, title = the folder's
// proposal.md first `# ` heading (falls back to the slug). Newest first.
async function readArchive(root = DEFAULT_ROOT) {
  const dir = join(root, 'openspec', 'changes', 'archive');
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return []; }                       // no archive yet → empty, not an error
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    const date = m ? m[1] : '';
    const slug = m ? m[2] : ent.name;
    let title = slug;
    try {
      const md = await readFile(join(dir, ent.name, 'proposal.md'), 'utf8');
      const h = md.match(/^#\s+(.+?)\s*$/m);
      if (h) title = h[1].trim();
    } catch { /* no proposal.md → keep slug */ }
    out.push({ id: ent.name, date, slug, title });
  }
  out.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));   // date-prefix sorts newest-first
  return out;
}

// The task checklist isn't in `openspec show --json` (which returns only id /
// title / deltas), so read the change's tasks.md directly — the same file the
// completion ring is computed from. Parses `- [ ]` / `- [x]` items, grouped by
// their `## ` section heading. Returns null when the change has no tasks.md.
// Works off any change directory so it serves both active changes and the
// archived folders under archive/.
async function readTasksFromDir(changeDir) {
  let md;
  try { md = await readFile(join(changeDir, 'tasks.md'), 'utf8'); } catch { return null; }
  const tasks = [];
  let section = '';
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { section = h[1].trim(); continue; }
    const m = line.match(/^\s*-\s+\[([ xX])\]\s*(.+?)\s*$/);
    if (m) tasks.push({ done: m[1].toLowerCase() === 'x', text: m[2].trim(), section });
  }
  return tasks;
}
const readTasks = (id, root = DEFAULT_ROOT) => readTasksFromDir(join(root, 'openspec', 'changes', id));

// Archived changes can't be read via `openspec show` (the CLI only knows active
// changes), so parse a delta `spec.md` straight from disk into the SAME shape the
// active drill-in renders: an array of { operation, spec, requirements:[{text,
// scenarios:[{rawText}]}] }. We mirror `openspec show --json`'s conventions —
// `text` is the first body line under each `### Requirement:` heading (falling
// back to the heading itself), and each `#### Scenario:` block's bullet lines
// become one scenario's rawText.
function parseDeltaSpec(md, specName) {
  const deltas = [];
  let op = null, reqs = null, curReq = null, curScn = null, needText = false;
  const flushScn = () => { if (curReq && curScn) { curReq.scenarios.push({ rawText: curScn.join('\n').trim() }); curScn = null; } };
  const flushReq = () => { flushScn(); if (curReq && !curReq.text) curReq.text = curReq.title; curReq = null; needText = false; };
  const flushOp = () => { flushReq(); if (op && reqs && reqs.length) deltas.push({ operation: op, spec: specName, requirements: reqs }); op = null; reqs = null; };
  for (const line of md.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\b/i))) { flushOp(); op = m[1].toUpperCase(); reqs = []; continue; }
    if ((m = line.match(/^###\s+Requirement:\s*(.*)$/i))) { flushReq(); curReq = { text: '', title: m[1].trim(), scenarios: [] }; if (reqs) reqs.push(curReq); needText = true; continue; }
    if ((m = line.match(/^####\s+Scenario:\s*(.*)$/i))) { flushScn(); curScn = []; continue; }
    if (curScn) { curScn.push(line); continue; }
    if (needText && curReq && line.trim()) { curReq.text = line.trim(); needText = false; }
  }
  flushOp();
  return deltas;
}

// Read one archived change folder (openspec/changes/archive/<id>/) into the
// drill-in payload: its title (proposal.md `# ` heading, else the slug), the
// delta specs parsed from specs/<cap>/spec.md, and its tasks.md checklist.
// Returns { ok:false } when the folder isn't there — the inspect-twin of show's
// not-found path. Reads only; never mutates an archived artifact.
async function readArchivedChange(id, root = DEFAULT_ROOT) {
  const base = join(root, 'openspec', 'changes', 'archive', id);
  try { await readdir(base); }
  catch { return { ok: false, json: null, stderr: `archived change "${id}" not found` }; }
  const slug = (id.match(/^\d{4}-\d{2}-\d{2}-(.+)$/) || [, id])[1];
  const proposal = await readDoc(base, 'proposal.md');
  const design = await readDoc(base, 'design.md');
  let title = slug;
  if (proposal) { const h = proposal.match(/^#\s+(.+?)\s*$/m); if (h) title = h[1].trim(); }
  const deltas = [];
  let caps = [];
  try { caps = await readdir(join(base, 'specs'), { withFileTypes: true }); } catch { /* no delta specs */ }
  for (const cap of caps) {
    if (!cap.isDirectory()) continue;
    try {
      const md = await readFile(join(base, 'specs', cap.name, 'spec.md'), 'utf8');
      deltas.push(...parseDeltaSpec(md, cap.name));
    } catch { /* skip unreadable cap */ }
  }
  const tasks = await readTasksFromDir(base);
  return { ok: true, json: { id, title, archived: true, deltaCount: deltas.length, deltas }, tasks, proposal, design };
}

// Which baseline capabilities does an active change touch, and how? Reads the
// change's delta-spec dirs (openspec/changes/<name>/specs/<cap>/spec.md) and
// reuses parseDeltaSpec to fold each cap's requirements into its set of
// operations (ADDED / MODIFIED / REMOVED). Cheap — active changes are few, and
// it's the same on-disk read the drill-in already does. Lets the Cockpit draw
// the change↔baseline cross-link without a second round-trip. Reads only.
async function changeTouches(name, root = DEFAULT_ROOT) {
  const base = join(root, 'openspec', 'changes', name);
  let caps = [];
  try { caps = await readdir(join(base, 'specs'), { withFileTypes: true }); } catch { return []; }
  const touches = [];
  for (const cap of caps) {
    if (!cap.isDirectory()) continue;
    try {
      const md = await readFile(join(base, 'specs', cap.name, 'spec.md'), 'utf8');
      const ops = [...new Set(parseDeltaSpec(md, cap.name).map((d) => d.operation).filter(Boolean))];
      touches.push({ spec: cap.name, operations: ops });
    } catch { /* skip unreadable cap */ }
  }
  return touches;
}

// Read one of a change's prose artifacts (proposal.md / design.md) as raw
// markdown for the drill-in — these are real OpenSpec artifacts that `openspec
// show --json` omits. Returns null when absent (design.md is optional). Reads only.
async function readDoc(changeDir, name) {
  try { return await readFile(join(changeDir, name), 'utf8'); }
  catch { return null; }
}

// One fetch, four sources. Reads only — never mutates an OpenSpec artifact.
// `validate --all --strict --json` returns every active change and spec's
// validity in a single pass; we stamp it onto each item as { valid, issues }.
async function cockpitState(root = DEFAULT_ROOT) {
  const [changesR, specsR, validR] = await Promise.all([
    execJson(['openspec', 'list', '--json'], root),
    execJson(['openspec', 'spec', 'list', '--json'], root),
    execJson(['openspec', 'validate', '--all', '--strict', '--json'], root),
  ]);
  const archived = await readArchive(root);
  // validate exits non-zero when something is invalid, so trust json.items
  // regardless of exit code. Key by type:id — validate's id is the change name / spec id.
  const validity = {};
  if (validR.json && Array.isArray(validR.json.items)) {
    for (const it of validR.json.items) validity[`${it.type}:${it.id}`] = { valid: !!it.valid, issues: (it.issues || []).length };
  }
  const stamp = (arr, type, key) => arr.map((o) => {
    const v = validity[`${type}:${o[key]}`];
    return v ? { ...o, valid: v.valid, issues: v.issues } : o;
  });
  const activeChanges = changesR.json && Array.isArray(changesR.json.changes) ? changesR.json.changes : [];
  const specs = Array.isArray(specsR.json) ? specsR.json : [];
  // Enrich each active change with the baseline capabilities its delta specs
  // touch, so the Cockpit can wire the in-flight ↔ baseline cross-link.
  const activeStamped = stamp(activeChanges, 'change', 'name');
  await Promise.all(activeStamped.map(async (c) => { c.touches = await changeTouches(c.name, root); }));
  return {
    repoRoot: root,
    activeChanges: activeStamped,
    specs: stamp(specs, 'spec', 'id'),
    archived,
    errors: {
      changes: changesR.ok ? null : (changesR.stderr || changesR.parseError || `exit ${changesR.code}`),
      specs:   specsR.ok   ? null : (specsR.stderr   || specsR.parseError   || `exit ${specsR.code}`),
    },
  };
}

// ── Request body reader (cap size) ───────────────────────────────
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // ── API: POST ./api/exec ──
    if (urlPath === '/api/exec') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST only' }); return; }
      let payload;
      try { payload = JSON.parse((await readBody(req)) || '{}'); }
      catch { sendJson(res, 400, { error: 'invalid JSON body' }); return; }

      const action = String(payload.action || '');
      try {
        const build = ACTIONS[action];
        if (!build) { sendJson(res, 400, { error: `unknown action "${action}"` }); return; }
        sendJson(res, 200, await runExec(build(payload)));
      } catch (e) {
        if (e && e.userFacing) { sendJson(res, 200, { ok: false, code: 1, cmd: action, stdout: '', stderr: e.message }); return; }
        sendJson(res, 500, { error: 'exec failed' });
      }
      return;
    }

    // ── API: GET ./api/cockpit (read-only aggregation) ──
    if (urlPath === '/api/cockpit') {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'GET only' }); return; }
      let root;
      try { root = await resolveRoot(new URL(req.url, 'http://localhost').searchParams.get('root')); }
      catch (e) { sendJson(res, e.userFacing ? 400 : 500, { error: e.userFacing ? e.message : 'resolve failed' }); return; }
      sendJson(res, 200, await cockpitState(root));
      return;
    }

    // ── API: GET ./api/cockpit/show?id=<name> (read-only drill-in) ──
    if (urlPath === '/api/cockpit/show') {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'GET only' }); return; }
      const params = new URL(req.url, 'http://localhost').searchParams;
      let id, root;
      try { id = reqName(params.get('id')); root = await resolveRoot(params.get('root')); }
      catch (e) { sendJson(res, e.userFacing ? 400 : 500, { error: e.userFacing ? e.message : 'resolve failed' }); return; }
      const data = await execJson(['openspec', 'show', id, '--json'], root);
      // For a change (has deltas), attach the artifacts show --json omits: the
      // tasks.md checklist and the proposal.md / design.md prose.
      if (data.json && Array.isArray(data.json.deltas)) {
        const dir = join(root, 'openspec', 'changes', id);
        data.tasks = await readTasks(id, root);
        data.proposal = await readDoc(dir, 'proposal.md');
        data.design = await readDoc(dir, 'design.md');
      }
      sendJson(res, 200, data);
      return;
    }

    // ── API: GET ./api/cockpit/archived?id=<name> (read-only archived drill-in) ──
    // Archived changes are invisible to `openspec show`, so read the folder directly.
    if (urlPath === '/api/cockpit/archived') {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'GET only' }); return; }
      const params = new URL(req.url, 'http://localhost').searchParams;
      let id, root;
      try { id = reqName(params.get('id')); root = await resolveRoot(params.get('root')); }
      catch (e) { sendJson(res, e.userFacing ? 400 : 500, { error: e.userFacing ? e.message : 'resolve failed' }); return; }
      sendJson(res, 200, await readArchivedChange(id, root));
      return;
    }

    // ── Static files ──
    let staticPath = urlPath;
    if (staticPath === '/' || staticPath === '') staticPath = '/index.html';
    const filePath = normalize(join(ROOT, staticPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

    const body = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // HTML no-store so the Local tab never shows a stale render; assets briefly cached.
    const cache = ext === '.html' ? 'no-store' : 'public, max-age=60';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    res.end(body);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('server error');
    }
  }
});

// listen(port) with no host binds to :: with dualstack ON — IPv4 + IPv6 both.
server.listen(PORT, () => {
  console.log('OpenSpec-port Control Room serving on:');
  console.log('  http://127.0.0.1:' + PORT + '   (IPv4)');
  console.log('  http://[::1]:' + PORT + '       (IPv6)');
  console.log('  default repo: ' + DEFAULT_ROOT
    + (process.env.OPENSPEC_REPO_ROOT ? '  (via OPENSPEC_REPO_ROOT)' : '  (default: app\'s parent)')
    + '  — Cockpit can override per request');
  console.log('  exec API: POST /api/exec  (cwd: ' + DEFAULT_ROOT + ')');
  console.log("Register this port as a Local app for the repo, then open the Local tab.");
});
