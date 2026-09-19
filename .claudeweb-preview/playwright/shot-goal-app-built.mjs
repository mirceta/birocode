// Screenshot the Goal app the real subagent run built in goal-app/ (openspec goal-app),
// served over a throwaway static server (ES modules do not load over file://).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(path.resolve(process.cwd(), '..', '..', 'client', 'package.json'))('playwright');

const root = path.resolve(process.cwd(), '..', '..', 'goal-app');
const OUT = path.resolve(process.cwd(), '..', 'out-goal-app-built.png');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(root, rel);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT, fullPage: true });
const title = await page.title();
await browser.close(); srv.close();
console.log(JSON.stringify({ title, files: fs.readdirSync(root), errors: errs, out: OUT }));
process.exit(errs.length === 0 ? 0 : 1);
