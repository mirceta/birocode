// Static widget gallery — tiny dual-stack server, no dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 5411;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) return res.writeHead(403).end('forbidden');
    const body = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});

// listen(port) with no host binds :: with dualstack ON — answers on 127.0.0.1 and [::1].
server.listen(PORT, () => console.log(`widgets on http://127.0.0.1:${PORT} and http://[::1]:${PORT}`));
