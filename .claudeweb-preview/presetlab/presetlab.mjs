// Fleet task d6e499cd — Management dashboard layout presets, live on the lab hub (lab.ps1: HUB, HUBPW, OUT).
//  1. the existing default view is untouched by loading the page and by SAVING presets;
//  2. three presets saved from three real arrangements (tabs toggled, panes reordered, dividers dragged),
//     by button, by Alt+Shift+S, and renamed through the ⋯ menu;
//  3. switching (click, Alt+1..3) restores exactly those panes, in order, with the same divider positions;
//  4. a manual drag marks the active preset modified; Revert restores it; a window resize keeps proportions;
//  5. reload: presets and the active one survive; the hub holds the same three;
//  6. a SECOND browser (fresh profile) sees the three presets and applies one;
//  7. a preset naming a tab that no longer exists opens the rest with a notice; ⇅ Sync merges, browser wins.
// Pane bodies are blurred in the screenshots: the feature is the layout, not the live content. A GIF is assembled
// from the frames (gifenc + pngjs from .preview-test).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const { HUB, HUBPW, OUT } = process.env;
const BASE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 300) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const TABS = ['arch', 'subagents', 'tasks', 'ideas', 'graph', 'kanban', 'recurring', 'events', 'status', 'topology', 'files', 'requests', 'examples', 'prompts', 'memory', 'settings'];
const START_ORDER = ['status', 'kanban', 'subagents', 'arch', 'memory', 'prompts', ...TABS.filter((k) => !['status', 'kanban', 'subagents', 'arch', 'memory', 'prompts'].includes(k))];
const DEFAULT_HIDDEN = TABS.filter((k) => !['arch', 'subagents'].includes(k));

let n = 0;
const frames = [];
const shot = async (page, name, { gif = true } = {}) => {
  n += 1;
  const buf = await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`) });
  if (gif) frames.push(buf);
};
const blurCss = '.mg__pane-body { filter: blur(5px); } .mg__label { filter: blur(4px); }';
const prep = async (ctx, seed) => {
  await ctx.addInitScript(({ css, seed }) => {
    try {
      localStorage.setItem('claudeweb_ui_mode', 'advanced');
      if (seed && !localStorage.getItem('manageapp.layout')) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    } catch {}
    const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  }, { css: blurCss, seed });
};
const visiblePanes = (page) => page.$$eval('.mg__body > [data-pane]', (els) => els.map((e) => e.getAttribute('data-pane')));
const fractions = (page) => page.$$eval('.mg__body > [data-pane]', (els) => { const w = els.map((e) => e.getBoundingClientRect().width); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); });
const close = (a, b, tol = 0.015) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);
const fmt = (f) => f.map((x) => x.toFixed(3)).join('/');
const dragGutter = async (page, key, dx) => {
  const g = page.locator(`[data-gutter="${key}"]`);
  const box = await g.boundingBox();
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y, { steps: 4 }); await page.mouse.move(x + dx, y, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(250);
};
const lsView = (page) => page.evaluate(() => ['manageapp.hidden', 'manageapp.paneOrder', 'manageapp.paneWeights', 'manageapp.layout'].map((k) => localStorage.getItem(k)).join('\n'));
const presetNames = (page) => page.$$eval('[data-preset]', (els) => els.map((e) => e.textContent.replace('🔖', '').replace(' •', '').trim()));

const b = await chromium.launch();
const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 } });
await prep(ctxA, { 'manageapp.layout': 'panes', 'manageapp.paneOrder': JSON.stringify(START_ORDER), 'manageapp.hidden': JSON.stringify(DEFAULT_HIDDEN) });
const page = await ctxA.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { if (d.type() === 'prompt') await d.accept('Chat + prompts'); else await d.accept(); });
const api = (p, init) => page.request.fetch(HUB + p, init);

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());
  const hub0 = await (await api('/api/settings/view-presets')).json();
  check('0 the lab hub starts with no presets', Array.isArray(hub0.presets) && hub0.presets.length === 0, JSON.stringify(hub0).slice(0, 80));

  // 1. the default view
  await page.goto(BASE);
  await page.locator('[data-presets]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const defaultLs = await lsView(page);
  check('1a the preset bar shows with no presets yet, the default view is the Operator\'s own', (await page.locator('[data-preset]').count()) === 0 && (await visiblePanes(page)).join(',') === 'subagents,arch', (await visiblePanes(page)).join(','));
  await shot(page, 'default-view-no-presets');

  // 2. preset 1: Status | Kanban | Subagents, dividers dragged
  await page.locator('[data-tab="arch"]').click();
  await page.locator('[data-tab="status"]').click();
  await page.locator('[data-tab="kanban"]').click();
  await page.waitForTimeout(300);
  await dragGutter(page, 'status|kanban', -180);
  await dragGutter(page, 'kanban|subagents', -120);
  const f1 = await fractions(page);
  const v1 = await visiblePanes(page);
  const lsBeforeSave = await lsView(page);
  await page.locator('[data-preset-save]').click();
  await until(async () => (await page.locator('[data-preset]').count()) === 1);
  check('2a "Save view" adds a preset tab named after the open panes', (await presetNames(page))[0] === 'Status | Kanban | Subagents', `${(await presetNames(page))[0]} · ${fmt(f1)}`);
  check('1b saving a preset does not touch the view state', (await lsView(page)) === lsBeforeSave);
  await shot(page, 'preset-1-saved');

  // preset 2: Status | Memory | Prompts, saved with Alt+Shift+S
  await page.locator('[data-tab="kanban"]').click();
  await page.locator('[data-tab="subagents"]').click();
  await page.locator('[data-tab="memory"]').click();
  await page.locator('[data-tab="prompts"]').click();
  await page.waitForTimeout(300);
  await dragGutter(page, 'status|memory', 260);
  const f2 = await fractions(page);
  const v2 = await visiblePanes(page);
  await page.keyboard.press('Alt+Shift+S');
  await until(async () => (await page.locator('[data-preset]').count()) === 2);
  check('2b Alt+Shift+S saves the view as a second preset', (await presetNames(page))[1] === 'Status | Memory | Prompts', `${(await presetNames(page))[1]} · ${fmt(f2)}`);

  // preset 3: Prompts | Arch agent (reordered with ◀), renamed through ⋯
  await page.locator('[data-tab="status"]').click();
  await page.locator('[data-tab="memory"]').click();
  await page.locator('[data-tab="arch"]').click();
  await page.waitForTimeout(300);
  const pr = await visiblePanes(page);
  if (pr[0] !== 'prompts') await page.locator('[data-pane="prompts"] [data-move-left]').click();
  await page.waitForTimeout(200);
  await dragGutter(page, 'prompts|arch', -300);
  const f3 = await fractions(page);
  const v3 = await visiblePanes(page);
  await page.locator('[data-preset-save]').click();
  await until(async () => (await page.locator('[data-preset]').count()) === 3);
  const id3 = await page.locator('[data-preset-index="3"]').getAttribute('data-preset');
  await page.locator(`[data-preset-menu="${id3}"]`).click();
  await shot(page, 'preset-menu');
  await page.locator('[data-preset-rename]').click();
  await until(async () => (await presetNames(page))[2] === 'Chat + prompts');
  check('2c a third preset (panes reordered first), renamed via ⋯ → Rename', (await presetNames(page))[2] === 'Chat + prompts' && v3.join(',') === 'prompts,arch', `${(await presetNames(page)).join(' / ')} · ${v3} · ${fmt(f3)}`);
  await shot(page, 'three-presets');

  // 3. switching
  await page.locator('[data-preset-index="1"]').click();
  await page.waitForTimeout(500);
  check('3a clicking preset 1 opens exactly its panes, in order', (await visiblePanes(page)).join(',') === v1.join(','), (await visiblePanes(page)).join(','));
  check('3b …with the same divider positions', close(await fractions(page), f1), `${fmt(await fractions(page))} vs ${fmt(f1)}`);
  check('3c the applied preset is highlighted, not modified', (await page.locator('[data-preset-index="1"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('[data-preset-modified]').count()) === 0);
  await shot(page, 'applied-preset-1');
  await page.keyboard.press('Alt+2');
  await page.waitForTimeout(500);
  check('3d Alt+2 switches to preset 2 (panes + dividers)', (await visiblePanes(page)).join(',') === v2.join(',') && close(await fractions(page), f2), `${(await visiblePanes(page)).join(',')} ${fmt(await fractions(page))} vs ${fmt(f2)}`);
  await shot(page, 'applied-preset-2');
  await page.keyboard.press('Alt+3');
  await page.waitForTimeout(500);
  check('3e Alt+3 switches to preset 3', (await visiblePanes(page)).join(',') === v3.join(',') && close(await fractions(page), f3), `${(await visiblePanes(page)).join(',')} ${fmt(await fractions(page))} vs ${fmt(f3)}`);
  await shot(page, 'applied-preset-3');

  // 4. modified → revert; resize keeps proportions
  await dragGutter(page, 'prompts|arch', 250);
  check('4a a manual drag marks the active preset modified (update / revert offered)', (await page.locator('[data-preset-modified="true"]').count()) === 1 && (await page.locator('[data-preset-revert]').count()) === 1);
  await shot(page, 'modified');
  await page.locator('[data-preset-revert]').click();
  await page.waitForTimeout(400);
  check('4b Revert restores the preset\'s dividers', close(await fractions(page), f3) && (await page.locator('[data-preset-modified]').count()) === 0, fmt(await fractions(page)));
  // Resize on preset 2 (every pane stays above the 220 px pane minimum at 1300 px; preset 3's 15% pane is AT it).
  await page.keyboard.press('Alt+2');
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.waitForTimeout(500);
  check('4c a narrower window keeps the proportions', close(await fractions(page), f2, 0.02) && (await page.locator('[data-preset-modified]').count()) === 0, `${fmt(await fractions(page))} vs ${fmt(f2)}`);
  await page.setViewportSize({ width: 1440, height: 900 });

  // 5. reload + hub copy
  await page.locator('[data-preset-index="1"]').click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('[data-preset]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  check('5a after a reload the three presets are there and preset 1 is still the applied one', (await presetNames(page)).join(' / ') === 'Status | Kanban | Subagents / Status | Memory | Prompts / Chat + prompts' && (await page.locator('[data-preset-index="1"]').getAttribute('aria-pressed')) === 'true' && close(await fractions(page), f1), (await presetNames(page)).join(' / '));
  const hub1 = await (await api('/api/settings/view-presets')).json();
  check('5b the hub holds the same three presets', hub1.presets.map((p) => p.name).join(' / ') === 'Status | Kanban | Subagents / Status | Memory | Prompts / Chat + prompts', hub1.presets.map((p) => `${p.name} [${p.fractions.join(',')}]`).join(' · '));
  check('5c no sync needed (browser and hub agree)', (await page.locator('[data-preset-sync]').count()) === 0);

  // 6. another browser
  const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await prep(ctxB, null);
  const pb = await ctxB.newPage();
  pb.on('pageerror', (e) => errors.push('B: ' + e.message));
  await pb.request.fetch(HUB + '/api/auth/login', { method: 'POST', data: { password: HUBPW } });
  await pb.goto(BASE);
  await pb.locator('[data-preset]').first().waitFor({ timeout: 20000 });
  check('6a a second browser (fresh profile) shows the hub\'s three presets', (await presetNames(pb)).length === 3, (await presetNames(pb)).join(' / '));
  const bDefault = await visiblePanes(pb);
  await pb.locator('[data-preset-index="2"]').click();
  await pb.waitForTimeout(500);
  check('6b …and applies preset 2 there: same panes, same dividers', (await visiblePanes(pb)).join(',') === v2.join(',') && close(await fractions(pb), f2), `default ${bDefault} → ${(await visiblePanes(pb)).join(',')} ${fmt(await fractions(pb))}`);
  await shot(pb, 'second-browser');

  // 7. a preset with a tab that no longer exists, added in browser B only → B differs from the hub
  await pb.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('manageapp.viewPresets'));
    list.push({ id: 'plegacy1', name: 'Old tab | Status | Kanban', auto: false, panes: [{ tab: 'oldtab' }, { tab: 'status' }, { tab: 'kanban' }], fractions: [0.4, 0.3, 0.3], created: 1, updated: 1 });
    localStorage.setItem('manageapp.viewPresets', JSON.stringify(list));
  });
  await pb.reload();
  await pb.locator('[data-preset-sync]').waitFor({ timeout: 15000 }).catch(() => {});
  check('7a browser B now differs from the hub → "⇅ Sync" is offered', (await pb.locator('[data-preset-sync]').count()) === 1);
  await pb.locator('[data-preset="plegacy1"]').click();
  const toast = await until(async () => (await pb.locator('[data-preset-missing]').count()) > 0 && pb.locator('[data-preset-missing]').first().textContent(), 5000);
  check('7b applying it opens the rest (Status | Kanban, half/half) and says the missing tab is gone', (await visiblePanes(pb)).join(',') === 'status,kanban' && close(await fractions(pb), [0.5, 0.5]) && /oldtab/.test(toast || ''), `${(await visiblePanes(pb)).join(',')} ${fmt(await fractions(pb))} · ${toast}`);
  await shot(pb, 'missing-tab-notice');
  await pb.locator('[data-preset-sync]').click();
  await until(async () => (await (await pb.request.fetch(HUB + '/api/settings/view-presets')).json()).presets.length === 4, 8000);
  const hub2 = await (await pb.request.fetch(HUB + '/api/settings/view-presets')).json();
  await until(async () => (await pb.locator('[data-preset-sync]').count()) === 0, 5000);
  check('7c Sync writes the merged list to the hub (4 presets) and the button goes away', hub2.presets.length === 4 && (await pb.locator('[data-preset-sync]').count()) === 0, hub2.presets.map((p) => p.name).join(' / '));
  // browser A deletes nothing; on reload it differs from the hub → sync merges the 4th in
  await page.reload();
  await page.locator('[data-preset-sync]').waitFor({ timeout: 15000 }).catch(() => {});
  const aHadSync = (await page.locator('[data-preset-sync]').count()) === 1;
  if (aHadSync) await page.locator('[data-preset-sync]').click();
  await until(async () => (await page.locator('[data-preset]').count()) === 4, 5000);
  check('7d browser A sees the difference, Sync brings the 4th preset in (A\'s three unchanged)', aHadSync && (await presetNames(page)).length === 4 && (await presetNames(page)).slice(0, 3).join(' / ') === 'Status | Kanban | Subagents / Status | Memory | Prompts / Chat + prompts', (await presetNames(page)).join(' / '));
  await shot(page, 'after-sync');
  // clean up B's legacy preset on the lab hub (the lab data dir is deleted anyway)
  void defaultLs;
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctxB.close();
} catch (e) {
  check('lab ran to the end', false, e.message);
} finally {
  await b.close();
}

// GIF: every frame at half size, 1.6 s each.
try {
  const gif = GIFEncoder();
  for (const buf of frames) {
    const png = PNG.sync.read(buf);
    const w = Math.floor(png.width / 2); const h = Math.floor(png.height / 2);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += png.data[((y * 2 + dy) * png.width + (x * 2 + dx)) * 4 + c];
        data[(y * w + x) * 4 + c] = s >> 2;
      }
    }
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: 1600 });
  }
  gif.finish();
  fs.writeFileSync(path.join(OUT, 'presets.gif'), gif.bytes());
  console.log(`GIF: ${frames.length} frames`);
} catch (e) { console.log('GIF failed: ' + e.message); }
out.passed = out.checks.filter((c) => c.ok).length;
out.total = out.checks.length;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@RESULT@@ ${out.passed}/${out.total}`);
