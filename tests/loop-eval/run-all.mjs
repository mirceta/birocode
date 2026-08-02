// Run the whole loop-eval suite: goal, queue, then golden (sequential — they
// share the isolated port, or in --live mode the one live harness + claude CLI).
// Combined summary + exit code 0 only if all pass.
//
//   node tests/loop-eval/run-all.mjs [--json out.json] [--live]
//
// --live (add-loop-eval-live-mode) is passed through to every scenario.
// Spends real Claude turns (~20-30 total) and ~40-70 minutes. Never CI.

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESCRIBE_VERSION } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
const live = process.argv.includes('--live');

// --describe (openspec: loop-eval-scenario-transparency): compose the child
// scenarios' own manifests — never restate them — then exit with no run.
if (process.argv.includes('--describe')) {
  const composes = ['goal', 'queue', 'golden'].map((name) => {
    const r = spawnSync(process.execPath, [join(HERE, `${name}.mjs`), '--describe'], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) {
      console.error(`${name}.mjs --describe failed:\n${r.stderr || r.stdout || r.error}`);
      process.exit(1);
    }
    return JSON.parse(r.stdout);
  });
  console.log(JSON.stringify({
    describeVersion: DESCRIBE_VERSION,
    id: 'run-all',
    title: 'Full sweep — goal, queue, golden; combined verdict',
    composes,
  }, null, 2));
  process.exit(0);
}

function runScenario(script, out) {
  return new Promise((res) => {
    const args = [join(HERE, script), '--json', out, ...(live ? ['--live'] : [])];
    const p = spawn(process.execPath, args, { stdio: 'inherit' });
    p.on('close', (code) => res(code ?? 1));
  });
}

const results = [];
for (const name of ['goal', 'queue', 'golden']) {
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
