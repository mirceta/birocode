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
// Run:  node serve.mjs            (defaults to port 5310)
//       PORT=1234 node serve.mjs  (any other port)
// No dependencies — Node's built-in http/fs/child_process only.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));     // openspec-port-app/
const REPO_ROOT = dirname(ROOT);                          // repo root — where openspec/ lives
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
  validate:          ()  => ['openspec', 'validate'],
  'validate-strict': ()  => ['openspec', 'validate', '--strict'],
  show:              (a) => ['openspec', 'show', reqName(a.id)],
  archive:           (a) => ['openspec', 'archive', reqName(a.id)],
  init:              ()  => ['openspec', 'init', '--tools', 'claude'],
  'git-status':      ()  => ['git', 'status', '--short', '--branch'],
};

function runExec(argv) {
  return new Promise((resolve) => {
    const [file, ...args] = argv;
    // shell:true so Windows resolves npm shims (openspec.cmd / git.cmd). Safe
    // because every token is a server constant or a SAFE_NAME-validated id.
    execFile(
      file, args,
      { cwd: REPO_ROOT, timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAXBUF, shell: true, windowsHide: true },
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

// ── propose: a real scaffold (no CLI verb exists for this; /opsx propose is a
// Claude slash command). Creates the change folder + the four ceremony files,
// refusing to clobber an existing change. The content is yours to write — this
// only removes the folder-creation friction. ──────────────────────
async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function scaffoldProposal(rawName) {
  const name = reqName(rawName);
  const rel = `openspec/changes/${name}`;
  const dir = join(REPO_ROOT, 'openspec', 'changes', name);
  if (await exists(dir)) {
    return { ok: false, code: 1, cmd: `propose ${name}`, stdout: '', stderr: `change "${name}" already exists at ${rel}/ — pick another name` };
  }
  const files = {
    'proposal.md': `# ${name}\n\n## Why\n\nTBD — the problem / motivation (restate-intent role).\n\n## What changes\n\nTBD — bullet the user-visible deltas.\n`,
    'design.md': `# Design — ${name}\n\n## Approach\n\nTBD — how it works.\n\n## Trade-offs\n\nTBD.\n`,
    'tasks.md': `# Tasks — ${name}\n\n- [ ] TBD first slice\n`,
    'specs/README.md': `Delta specs for "${name}" go here, grouped by capability:\n\n  specs/<capability>/spec.md\n\nEach requirement uses SHALL/MUST and carries at least one\n\n  #### Scenario: ...\n    GIVEN ...\n    WHEN ...\n    THEN ...\n`,
  };
  const created = [];
  for (const [rel2, body] of Object.entries(files)) {
    const full = join(dir, rel2);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body, 'utf8');
    created.push(`${rel}/${rel2}`);
  }
  return {
    ok: true, code: 0, cmd: `propose ${name}`,
    stdout: `scaffolded ${created.length} files:\n` + created.map((f) => '  + ' + f).join('\n')
      + `\n\nNext: write the deltas under ${rel}/specs/<cap>/spec.md, then run "validate --strict".`,
    stderr: '',
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
        if (action === 'propose') { sendJson(res, 200, await scaffoldProposal(payload.id)); return; }
        const build = ACTIONS[action];
        if (!build) { sendJson(res, 400, { error: `unknown action "${action}"` }); return; }
        sendJson(res, 200, await runExec(build(payload)));
      } catch (e) {
        if (e && e.userFacing) { sendJson(res, 200, { ok: false, code: 1, cmd: action, stdout: '', stderr: e.message }); return; }
        sendJson(res, 500, { error: 'exec failed' });
      }
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
  console.log('  exec API: POST /api/exec  (cwd: ' + REPO_ROOT + ')');
  console.log("Register this port as a Local app for the repo, then open the Local tab.");
});
