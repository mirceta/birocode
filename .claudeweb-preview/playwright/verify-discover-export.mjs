// Headless check for openspec local-apps-cache-export-import: the panel's
// Export button shows the cache as import-shaped JSON (whitelist fields only,
// no running/discoveredAt), Copy puts it on the clipboard with a ✓ confirm,
// Export/Import sections are mutually exclusive, Export is disabled when the
// repo has no cache, and the exported text round-trips through Import.
// Run: node discover-export-check.mjs   (expects the preview harness on :5200
// with the seeded preview-data datadir — first dock repo has a cache)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const URL = process.env.PUBLIC_URL || 'http://localhost:5200/';
const OUT = 'out-discover-export';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[browser error]', m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'));
await page.goto(`${URL}studio`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
if (await page.$('.pw-gate__input')) {
  await page.fill('.pw-gate__input', 'changeme');
  await page.click('.pw-gate__button');
  await page.waitForTimeout(2000);
}

// --- 0. Disabled state first: fake a no-cache repo. The dock's shared hook
// reattaches (GET discover/status) as soon as the phones view mounts — and a
// previous run may have seeded the in-memory job — so both routes must be in
// place BEFORE the dashboard opens for the Export button to be disabled.
await page.route('**/api/local-apps/discover/status*', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'idle' }) }));
await page.route('**/api/local-apps/cache', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'no-cache' }) }));

await page.keyboard.press('Control+Shift+D');
await page.waitForSelector('.app-content--dash', { timeout: 10000 });
await page.getByText('Phones', { exact: true }).click();
await page.waitForSelector('.phone', { timeout: 10000 });
await page.waitForTimeout(1500);

await page.click('.phone__discover-btn--panel');
await page.waitForSelector('.phone__discover-panel', { timeout: 5000 });
await page.waitForSelector('.phone__discover-panel .phone__discover-msg', { timeout: 5000 });
const exportBtn = page.locator('.phone__discover-panel .phone__discover-buttons button', { hasText: 'Export' });
check('export button disabled with no cache', await exportBtn.isDisabled());
await page.screenshot({ path: `${OUT}/01-no-cache-disabled.png` });

// Restore the real endpoints and load the actual cache.
await page.unroute('**/api/local-apps/discover/status*');
await page.unroute('**/api/local-apps/cache');
await page.locator('.phone__discover-panel .phone__discover-buttons button', { hasText: 'Load cache' }).click();
await page.waitForSelector('.phone__discover-panel .phone__discover-list li', { timeout: 5000 });
check('export button enabled once findings load', !(await exportBtn.isDisabled()));
const rowCount = (await page.$$('.phone__discover-panel .phone__discover-list li')).length;

// --- 1. Export shows import-shaped JSON for exactly the listed findings.
await exportBtn.click();
await page.waitForSelector('.phone__discover-export-text', { timeout: 3000 });
const exported = await page.$eval('.phone__discover-export-text', (e) => e.value);
await page.screenshot({ path: `${OUT}/02-export-open.png` });
let parsed = null;
try { parsed = JSON.parse(exported); } catch { /* checked below */ }
check('export is valid JSON', !!parsed, exported.slice(0, 80));
check('export has { apps: [...] } wrapper', Array.isArray(parsed?.apps));
check('export row count matches the panel list', parsed?.apps?.length === rowCount, `${parsed?.apps?.length} vs ${rowCount}`);
const allowed = new Set(['name', 'port', 'folder', 'evidence', 'startCommand']);
const badKeys = (parsed?.apps || []).flatMap((a) => Object.keys(a).filter((k) => !allowed.has(k)));
check('only whitelist fields exported (no running/discoveredAt)', badKeys.length === 0, JSON.stringify(badKeys));
check('every finding has name/port/folder', (parsed?.apps || []).every((a) => a.name && a.port && a.folder));

// --- 2. Copy → clipboard holds the JSON and the button confirms.
await page.locator('.phone__discover-import-actions button', { hasText: 'Copy JSON' }).click();
await page.waitForTimeout(200);
const copiedLabel = await page.locator('.phone__discover-import-actions button').first().textContent();
check('copy button shows the copied confirmation', copiedLabel.includes('Copied'), copiedLabel);
// The execCommand fallback copies from a textarea, which Windows normalizes
// to CRLF — semantically identical JSON, so compare line-ending-insensitively.
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('clipboard holds the exported JSON (modulo line endings)',
  clip.replace(/\r\n/g, '\n') === exported.replace(/\r\n/g, '\n'),
  `clip len=${clip.length} vs exported len=${exported.length}`);
await page.screenshot({ path: `${OUT}/03-copied.png` });

// --- 3. Export and Import are mutually exclusive.
const importBtn = page.locator('.phone__discover-panel .phone__discover-buttons button', { hasText: 'Import' });
await importBtn.click();
await page.waitForSelector('.phone__discover-import-text:not([readonly])', { timeout: 3000 });
check('opening Import closes Export', !(await page.$('.phone__discover-export-text')));
await exportBtn.click();
await page.waitForSelector('.phone__discover-export-text', { timeout: 3000 });
check('opening Export closes Import', !(await page.$('.phone__discover-import-text:not([readonly])')));

// --- 4. Round-trip: the exported text imports unchanged (union is a no-op).
await importBtn.click();
await page.fill('.phone__discover-import-text', clip);
await page.locator('.phone__discover-import-actions button', { hasText: 'Import to cache' }).click();
await page.waitForFunction(
  () => !document.querySelector('.phone__discover-import'),
  { timeout: 5000 },
);
check('exported JSON is accepted by Import (area closes on success)', true);
const rowsAfter = (await page.$$('.phone__discover-panel .phone__discover-list li')).length;
check('round-trip import leaves the same finding set', rowsAfter === rowCount, `${rowsAfter} vs ${rowCount}`);
await page.screenshot({ path: `${OUT}/04-after-roundtrip.png` });

await browser.close();
writeFileSync(`${OUT}/result.txt`, failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
