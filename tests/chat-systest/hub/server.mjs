// Chat system-test control hub — a small build-less Node server that makes the
// tests/chat-systest suite understandable and runnable from one web page.
//
// Served onto the Claude Web Local tab per docs/local-exposure-convention.md:
//   • dual-stack bind (127.0.0.1 AND [::1])   • serves the SPA at /   • the SPA
//   uses relative URLs only, so it survives the /api/localview/<repo>/app/<id>/
//   reverse-proxy sub-path.
//
// It spawns the existing .mjs suites (streaming PASS/FAIL live), surfaces the
// scenario catalog + known findings, and can orchestrate the isolated instance
// (see instance.mjs). No production C# code is touched.
//
//   HUB_PORT   port to listen on (default 5320)
//
// Suites run against the instance recorded in hub/.state/instance.json (written
// by "Launch instance"); if that file is absent you can still point the hub at a
// manually-launched instance via BASE/RID/PW/MODEL/SCRATCH env vars.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, health, base as cfgBase } from './instance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const SYSTEST = join(HERE, '..');                 // tests/chat-systest
const STATE_DIR = join(HERE, '.state');
const HISTORY = join(STATE_DIR, 'history.json');
const PORT = Number(process.env.HUB_PORT || 5320);

const manifest = JSON.parse(readFileSync(join(HERE, 'suites.json'), 'utf8'));
const suiteById = Object.fromEntries(manifest.suites.map((s) => [s.id, s]));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---- env for a suite run -----------------------------------------------------
// Prefer the recorded isolated instance; fall back to env / README defaults so
// the hub also works against a hand-launched instance.
function suiteEnv() {
  const s = readState();
  return {
    BASE: process.env.BASE || s?.base || cfgBase(),
    RID: process.env.RID || s?.rid || '',
    PW: process.env.PW || s?.pw || 'systest-pw-9912',
    MODEL: process.env.MODEL || s?.model || 'claude-haiku-4-5',
    SCRATCH: process.env.SCRATCH || s?.scratch || '',
  };
}

// ---- run history -------------------------------------------------------------
function loadHistory() { try { return JSON.parse(readFileSync(HISTORY, 'utf8')); } catch { return []; } }
function pushHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(HISTORY, JSON.stringify(h.slice(0, 50), null, 2));
}

// ---- tiny helpers ------------------------------------------------------------
const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
function sseStart(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
}
const sseSend = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

// ---- static files ------------------------------------------------------------
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = normalize(join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC) || !existsSync(full)) { res.writeHead(404).end('not found'); return; }
  const body = readFileSync(full);
  res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}

// ---- suite run (streamed) ----------------------------------------------------
function runSuite(res, suiteId) {
  const suite = suiteById[suiteId];
  if (!suite) { sendJson(res, 400, { error: `unknown suite ${suiteId}` }); return; }
  const env = suiteEnv();
  sseStart(res);
  sseSend(res, { type: 'start', suite: suiteId, env: { BASE: env.BASE, RID: env.RID, MODEL: env.MODEL } });

  const file = join(SYSTEST, suite.file);
  const child = spawn(process.execPath, [file], { cwd: join(HERE, '..', '..', '..'), env: { ...process.env, ...env } });

  let passed = 0, total = 0, summary = null;
  const onLine = (stream) => (chunk) => String(chunk).split(/\r?\n/).forEach((line) => {
    if (line === '') return;
    let kind = 'log';
    if (/\[PASS\]/.test(line)) { kind = 'pass'; passed++; total++; }
    else if (/\[FAIL\]/.test(line)) { kind = 'fail'; total++; }
    const m = line.match(/summary:\s*(\d+)\/(\d+)\s*passed/);
    if (m) summary = { passed: Number(m[1]), total: Number(m[2]) };
    sseSend(res, { type: 'line', stream, kind, line });
  });
  child.stdout.on('data', onLine('out'));
  child.stderr.on('data', onLine('err'));

  const finish = (code) => {
    const result = summary || { passed, total };
    const entry = { id: `${suiteId}-${Date.now()}`, suite: suiteId, ts: Date.now(),
      passed: result.passed, total: result.total, ok: code === 0 };
    pushHistory(entry);
    sseSend(res, { type: 'exit', code, ...entry });
    res.end();
  };
  child.on('error', (e) => { sseSend(res, { type: 'line', stream: 'err', kind: 'fail', line: `spawn error: ${e.message}` }); finish(1); });
  child.on('close', finish);
  req_onClose(res, () => { try { child.kill(); } catch { /* */ } });
}

// abort the child if the browser disconnects mid-run
function req_onClose(res, fn) { res.on('close', fn); }

// ---- instance lifecycle (streamed) ------------------------------------------
function runInstance(res, cmd) {
  sseStart(res);
  const child = spawn(process.execPath, [join(HERE, 'instance.mjs'), cmd], { cwd: HERE, env: process.env });
  const onLine = (stream) => (chunk) => String(chunk).split(/\r?\n/).forEach((line) => {
    if (line === '') return;
    let obj; try { obj = JSON.parse(line); } catch { obj = { type: stream, msg: line }; }
    sseSend(res, obj);
  });
  child.stdout.on('data', onLine('out'));
  child.stderr.on('data', onLine('err'));
  child.on('close', (code) => { sseSend(res, { type: 'exit', code }); res.end(); });
  child.on('error', (e) => { sseSend(res, { type: 'err', msg: e.message }); res.end(); });
}

// ---- router ------------------------------------------------------------------
const handler = async (req, res) => {
  const url = req.url || '/';
  try {
    if (url === '/api/suites') return sendJson(res, 200, manifest);
    if (url === '/api/history') return sendJson(res, 200, loadHistory());
    if (url === '/api/instance') {
      const s = readState();
      const up = await health(s?.base || cfgBase());
      return sendJson(res, 200, { up, base: s?.base || cfgBase(), rid: s?.rid || '', model: s?.model || '', scratch: s?.scratch || '', hasState: !!s });
    }
    if (url.startsWith('/api/run/') && req.method === 'POST') return runSuite(res, url.slice('/api/run/'.length));
    if (url === '/api/instance/up' && req.method === 'POST') return runInstance(res, 'up');
    if (url === '/api/instance/down' && req.method === 'POST') return runInstance(res, 'down');
    if (url.startsWith('/api/')) return sendJson(res, 404, { error: 'no such endpoint' });
    return serveStatic(req, res, url);
  } catch (e) {
    sendJson(res, 500, { error: e?.message || String(e) });
  }
};

// ---- dual-stack listen -------------------------------------------------------
// The harness dials 127.0.0.1 and also probes [::1]; bind both families so the
// Local-tab embed never comes back blank (local-exposure-convention rule 1).
for (const host of ['0.0.0.0', '::1']) {
  http.createServer(handler).listen(PORT, host)
    .on('listening', () => console.log(`[hub] listening on ${host === '::1' ? `[${host}]` : host}:${PORT}`))
    .on('error', (e) => console.warn(`[hub] bind ${host}:${PORT} failed: ${e.code} (other family may already cover it)`));
}
console.log(`[hub] Chat system-test hub — open http://localhost:${PORT}/`);
