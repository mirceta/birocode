// global-example/serve.mjs
//
// A minimal product that IS the five-rule Global-exposure demonstration — the
// public twin of homepage/serve.mjs (the LOCAL example). Run it, expose it
// through IIS/ARR at /preview/ -> :5200, and it proves each rule by behaving
// correctly:
//   1. Bind 0.0.0.0:5200 — all interfaces (not localhost), so the off-box proxy
//      can reach it. Launch detached (launch-detached.vbs); free the port first.
//   2. Serve at root — GET / returns index.html.
//   3. (client half lives in assets/app.js: ./ relative asset + fetch URLs.)
//   4. Body-ful POST — POST /api/bump accepts a JSON body and mutates state.
//   5. Beat ARR's GET cache — every /api response is Cache-Control: no-store
//      (server half); assets/app.js cache-busts every GET (client half).
//
// Dependency-free: Node's built-in http/fs only. The /preview-strip + no-store
// + real-404 tricks mirror the game-arcade product that survives the real
// public IIS/ARR proxy.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5200;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// The single piece of mutable state the demo mutates — a shared counter. In
// memory only; restarting the server resets it. Enough to demonstrate a POST
// that mutates and a GET that reads (rules 4 & 5).
let count = 0;

function sendJson(res, obj, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    // Rule 5, server half: tell ARR not to cache. ARR may ignore it (which is
    // exactly why the client ALSO cache-busts) — but setting it is correct.
    'cache-control': 'no-store, no-cache, must-revalidate',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  try {
    // The frontend is served under the /preview/ base, so its asset + fetch URLs
    // arrive as /preview/... On direct-LAN access the prefix is present; behind
    // IIS/ARR it is already stripped. Peel it here so ONE code path serves both.
    let url = req.url || '/';
    if (url.startsWith('/preview/')) url = url.slice('/preview'.length);
    else if (url === '/preview') url = '/';

    const pathOnly = decodeURIComponent(url.split('?')[0]);

    // ---- API (rules 4 & 5) ----
    if (pathOnly === '/api/state' && req.method === 'GET') {
      return sendJson(res, { count });
    }
    if (pathOnly === '/api/bump' && req.method === 'POST') {
      // Rule 4: a body is expected. We don't even need its contents — the point
      // is the request CARRIES one (even {}), or IIS/ARR 411s before we're ever
      // reached. Read and ignore.
      await readBody(req);
      count += 1;
      return sendJson(res, { count });
    }
    // Any other /api/* is a real 404 — never fall back to HTML (a JSON caller
    // getting HTML back is a confusing MIME error that masks "no such route").
    if (pathOnly.startsWith('/api/')) {
      return sendJson(res, { error: 'not found' }, 404);
    }

    // ---- static (rules 1 & 2) ----
    const rel = pathOnly === '/' || pathOnly === '' ? '/index.html' : pathOnly;
    const filePath = normalize(join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // index.html must never cache (it pins which assets to load); other assets
    // may cache briefly. A missing file is a real 404 (catch below) — broken
    // stays visibly broken.
    const cache = ext === '.html' ? 'no-store, must-revalidate' : 'public, max-age=60';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    res.end(data);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('server error');
    }
  }
});

// Rule 1: bind 0.0.0.0 — ALL interfaces, not localhost — so the off-box IIS/ARR
// proxy (which dials the machine's address) can reach us. A loopback-only bind
// is invisible to the public door.
server.listen(PORT, '0.0.0.0', () => {
  console.log('Global-exposure example serving on 0.0.0.0:' + PORT);
  console.log('  direct:    http://localhost:' + PORT + '/');
  console.log('  via proxy: https://<domain>/preview/  (IIS/ARR strips /preview/ -> :' + PORT + ')');
});
