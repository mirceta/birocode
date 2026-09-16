// Renders understanding-app/ (fleet task f7224e55: the Goal app per repo agent) from disk and
// asserts the five tabs, the chain animation, the state details, the mapping table and the ten
// question cards work with no page errors; screenshots each tab.
//   node check-understanding-goal.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(repo, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(pathToFileURL(path.join(repo, 'understanding-app', 'index.html')).href, { waitUntil: 'load' });
const r = {};
r.tabs = (await page.$$('.tab')).length === 5;
r.chainSteps = (await page.$$('#chain .step')).length === 7 && (await page.$$('#auto .step')).length === 4;
await page.click('#play');
await page.waitForTimeout(800);
r.chainAnimates = !!(await page.$('#chain .step.is-hot'));
await page.screenshot({ path: path.join(OUT, 'understanding-goal-app-exists.png') });
await page.click('.tab[data-view="mirror"]');
r.mapRows = (await page.$$('#map tbody tr')).length === 14;
await page.screenshot({ path: path.join(OUT, 'understanding-goal-app-mirror.png') });
await page.click('.tab[data-view="life"]');
await page.click('#states .state[data-s="unchanged"]');
r.stateDetail = /goal unchanged/.test(await page.$eval('#statedetail', (e) => e.textContent));
await page.click('.tab[data-view="decide"]');
r.questions = (await page.$$('#qs .q')).length === 10;
await page.click('#Q1 input[value="0"]');
r.tickMarks = await page.$eval('#Q1', (e) => e.classList.contains('is-answered'));
await page.screenshot({ path: path.join(OUT, 'understanding-goal-app-decide.png'), fullPage: true });
r.relativeUrlsOnly = !/(src|href)="\//.test(await page.content());
r.noPageErrors = errs.length === 0;
await browser.close();
console.log(JSON.stringify({ r, errs }, null, 1));
process.exit(Object.values(r).every(Boolean) ? 0 : 1);
