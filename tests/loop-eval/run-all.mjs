// Run the whole loop-eval suite: goal then queue (sequential — they share the
// isolated port, or in --live mode the one live harness + claude CLI).
// Combined summary + exit code 0 only if both pass.
//
//   node tests/loop-eval/run-all.mjs [--json out.json] [--live]
//
// --live (add-loop-eval-live-mode) is passed through to both scenarios.
// Spends real Claude turns (~15-20 total) and ~30-45 minutes. Never CI.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
const live = process.argv.includes('--live');

function runScenario(script, out) {
  return new Promise((res) => {
    const args = [join(HERE, script), '--json', out, ...(live ? ['--live'] : [])];
    const p = spawn(process.execPath, args, { stdio: 'inherit' });
    p.on('close', (code) => res(code ?? 1));
  });
}

const results = [];
for (const name of ['goal', 'queue']) {
  const out = join(HERE, `.out-${name}.json`);
  console.log(`\n=== loop-eval: ${name} scenario ===\n`);
  const code = await runScenario(`${name}.mjs`, out);
  let summary = null;
  try { summary = JSON.parse(readFileSync(out, 'utf8')); rmSync(out, { force: true }); } catch { /* crashed before summary */ }
  results.push({ name, exitCode: code, pass: code === 0, summary });
}

const pass = results.every((r) => r.pass);
console.log('\n=== loop-eval: combined result ===');
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ pass, results }, null, 2));
process.exit(pass ? 0 : 1);
