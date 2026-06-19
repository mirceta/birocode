// Dual-stack static server for the OpenSpec-port Control Room — a dedicated
// `kind: repo` Local app (distinct from the harness-served Understanding app).
//
// Satisfies the three-rule Local-exposure contract (docs/local-exposure-convention.md):
//   • Dual-stack bind — listen on :: with dualstack ON → answers on 127.0.0.1 and [::1].
//   • Serve at root — GET / returns index.html.
//   • Relative URLs — index.html references ./app.js etc., resolving under the proxy sub-path.
//
// Run:  node serve.mjs            (defaults to port 5310)
//       PORT=1234 node serve.mjs  (any other port)
// No dependencies — Node's built-in http/fs only.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5310;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

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
  console.log("Register this port as a Local app for the repo, then open the Local tab.");
});
