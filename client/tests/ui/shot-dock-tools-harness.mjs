// Evidence shot for the dock's Tools lane listing the harness's own MCP server (openspec
// repo-agent-harness-tools): the real ToolsPanel (fixtures/tools-panel.html) over a mocked
// GET /api/tools that carries the `harness` block the controller now returns. Asserts the block
// sits ABOVE the Birokrat section, lists the five tools with their parameters, names the
// endpoint, and that the Birokrat form still renders below; screenshots it.
//
//   node client/tests/ui/shot-dock-tools-harness.mjs
// Output: docs/screenshots/dock-tools-harness.png (eight tools since openspec hub-file-system)

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const prop = (type, description) => ({ type, description });
const schema = (props, required = []) => ({ type: 'object', properties: props, additionalProperties: false, ...(required.length ? { required } : {}) });
// The five entries as RepoAgentMcpServer.ToolsList() serves them (names + parameter sets pinned by RepoAgentHarnessToolsTests).
const tools = [
  { name: 'my_effort', description: 'Which board effort am I in? …', inputSchema: schema({ includeDelivered: prop('boolean', 'also list cards already merged / done (default false)') }) },
  { name: 'report_leg', description: 'Record where a leg\'s work lives — branch, commit and/or the pull request URL …', inputSchema: schema({ task: prop('string', 'the card'), leg: prop('string', 'which leg'), branch: prop('string', 'the branch'), commit: prop('string', 'the head commit'), pr: prop('string', 'the pull request URL') }) },
  { name: 'harness_help', description: 'What a harness (Claude Web) feature is and how YOU use or update it in this repo — read from the harness\'s own convention docs on every call.', inputSchema: schema({ topic: prop('string', 'a topic id from the index, optionally #section'), query: prop('string', 'a question in words') }) },
  { name: 'stash_prompt', description: 'Add a prompt to YOUR OWN queue: the stash of your dock tab, which a queue loop drains head first.', inputSchema: schema({ text: prop('string', 'the prompt to queue'), first: prop('boolean', 'put it at the head (default false)') }, ['text']) },
  { name: 'arm_my_loop', description: 'Arm, update, stop or read YOUR OWN loop with the Loop panel\'s parameters — armed by "agent".', inputSchema: schema({ action: prop('string', 'start | update | stop | status'), kind: prop('string', 'suggestion | recipe | goal | queue'), mode: prop('string', 'suggest | drive'), goal: prop('string', 'goal kind'), prompt: prop('string', 'recipe kind: the prompt'), sentinel: prop('string', 'recipe kind: the sentinel'), maxIterations: prop('integer', 'the cap, 1–100'), recipe: prop('string', 'a recipe id or name'), verifyEnabled: prop('boolean', 'queue: verify each step'), includeFooterClauses: prop('boolean', 'append the footer clauses'), rearm: prop('boolean', 'update: re-arm a stopped loop') }) },
  { name: 'hub_upload', description: 'Upload a file to the hub file system — the sandboxed store on this machine\'s harness.', inputSchema: schema({ path: prop('string', 'the hub path'), localPath: prop('string', 'a file under your repo folder'), text: prop('string', 'content instead of a file'), note: prop('string', 'what it is'), overwrite: prop('boolean', 'replace an existing hub file') }, ['path']) },
  { name: 'hub_download', description: 'Download a hub file into YOUR repo folder.', inputSchema: schema({ path: prop('string', 'the hub path'), localPath: prop('string', 'where to write it'), overwrite: prop('boolean', 'replace an existing local file') }, ['path']) },
  { name: 'hub_files', description: 'List the hub file system on this machine.', inputSchema: schema({ prefix: prop('string', 'only under this prefix') }) },
  { name: 'my_local_apps', description: 'YOUR OWN local apps, instantly: what they are, where they live, how to run them.', inputSchema: schema({ action: prop('string', 'list | status | start | stop | restart (default list)'), app: prop('string', 'one app: its id, its name, or its port') }) },
];
const toolsView = {
  repoId: 'r-prg',
  harness: { server: { name: 'claude-web', transport: 'http', url: 'http://127.0.0.1:5099/api/agents/mcp?repo=r-prg', protocolVersion: '2025-03-26', tokenSet: true, alwaysOn: true }, tools },
  birokrat: { enabled: false, apiKeySet: false, apiKeyHint: '', apiUrl: 'https://next.birokrat.si/api/v2/', companies: [] },
  host: { birokratServerEntry: '', effectiveServerEntry: '', serverEntryExists: false, nodeAvailable: true },
};

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  const body = pathname === '/api/tools' ? toolsView : pathname === '/api/auth/check' ? { authenticated: true } : {};
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/tests/ui/fixtures/tools-panel.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-tools-harness]', { timeout: 15000 });
await page.waitForSelector('[data-tools-birokrat]', { timeout: 15000 });
const seen = await page.evaluate(() => {
  const h = document.querySelector('[data-tools-harness]');
  const b = document.querySelector('[data-tools-birokrat]');
  const order = h && b ? (h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false;
  const names = [...document.querySelectorAll('[data-tools-harness-tool]')].map((e) => e.dataset.toolsHarnessTool);
  const params = Object.fromEntries([...document.querySelectorAll('[data-tools-harness-tool]')].map((e) => [e.dataset.toolsHarnessTool, e.querySelectorAll('.arch-tools__param').length]));
  const required = [...document.querySelectorAll('[data-tools-harness-tool="stash_prompt"] .arch-tools__ptype')].map((e) => e.textContent);
  return { count: h?.dataset.toolsHarnessCount, names, params, required, head: h?.querySelector('.toolsp__toolhead')?.textContent, intro: h?.querySelector('.toolsp__intro')?.textContent, order, birokratTitle: b?.querySelector('.toolsp__toolhead')?.textContent };
});
await page.screenshot({ path: path.join(OUT, 'dock-tools-harness.png'), fullPage: true });
await browser.close();
await server.close();

const result = {
  harnessBlockAboveBirokrat: seen.order && /Birokrat API/.test(seen.birokratTitle || ''),
  nineToolsListedInServerOrder: seen.names.join(',') === 'my_effort,report_leg,harness_help,stash_prompt,arm_my_loop,hub_upload,hub_download,hub_files,my_local_apps' && seen.count === '9',
  parametersRendered: seen.params.arm_my_loop === 11 && seen.params.harness_help === 2 && seen.params.stash_prompt === 2 && seen.params.my_effort === 1 && seen.params.hub_upload === 5 && seen.params.hub_download === 3 && seen.params.hub_files === 1 && seen.params.my_local_apps === 2,
  requiredMarked: seen.required.some((t) => /required/.test(t)),
  headSaysAlwaysOnAndNamesTheServer: /claude-web/.test(seen.head || '') && /always on/i.test(seen.head || ''),
  introNamesTheEndpoint: /api\/agents\/mcp\?repo=r-prg/.test(seen.intro || ''),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ seen, pageErrors: errs, result, out: path.join(OUT, 'dock-tools-harness.png') }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
