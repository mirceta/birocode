// Compose leftwin.mjs's per-window captures into one labelled frame per step (LEFT | RIGHT) and an animated
// GIF, for the PR (openspec harness-tabs-left-window). Reads OUT/result.json + OUT/shots, writes OUT/frames/*.png
// and OUT/leftwin.gif.   OUT=<dir> node compose.mjs   (run from .preview-test: playwright, gifenc, pngjs)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const OUT = process.env.OUT;
const res = JSON.parse(fs.readFileSync(path.join(OUT, 'result.json'), 'utf8'));
const FR = path.join(OUT, 'frames');
fs.mkdirSync(FR, { recursive: true });
for (const f of fs.readdirSync(FR)) fs.unlinkSync(path.join(FR, f));
const b64 = (f) => (f && fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : null);
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pane = (side, w) => {
  const img = b64(w.f);
  return `<div class="pane"><div class="bar ${side}">${side === 'L' ? '◀ LEFT window — agents' : 'RIGHT window — dashboard ▶'}<span>${esc(w.title || '')}</span></div>
  ${img ? `<img src="${img}">` : '<div class="gone">window closed</div>'}<div class="url">${esc(w.url)}</div></div>`;
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 640 } });
const files = [];
for (const fr of res.frames) {
  await page.setContent(`<!doctype html><style>
  body{margin:0;background:#11151c;color:#e6edf3;font:14px system-ui,sans-serif}
  .cap{padding:10px 14px;font-size:17px;font-weight:600;background:#1c2330}
  .row{display:flex;gap:10px;padding:10px}
  .pane{flex:1;border:2px solid #30363d;border-radius:8px;overflow:hidden;background:#0d1117}
  .bar{padding:5px 8px;font-weight:600;display:flex;justify-content:space-between;gap:8px}
  .bar span{font-weight:400;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%}
  .L{background:#1f6feb33}.R{background:#8957e533}
  img{display:block;width:100%;height:440px;object-fit:cover;object-position:top}
  .gone{height:440px;display:flex;align-items:center;justify-content:center;opacity:.6}
  .url{padding:4px 8px;font:12px monospace;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style><div class="cap">${esc(fr.caption)}</div><div class="row">${pane('L', fr.left)}${pane('R', fr.right)}</div>`);
  const f = path.join(FR, `${String(fr.n).padStart(2, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
const gif = GIFEncoder();
for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(f));
  const palette = quantize(png.data, 256);
  gif.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay: 2600 });
}
gif.finish();
fs.writeFileSync(path.join(OUT, 'leftwin.gif'), gif.bytes());
console.log(`frames ${files.length}, gif ${(gif.bytes().length / 1024).toFixed(0)} KB`);
