// Acceptance check for qtodo's `done` command — the goal-loop fixture's
// ground truth. Exits 0 with ALL CHECKS PASS only when the feature genuinely
// works. Runs against a throwaway TODO_FILE so it never touches todos.json.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'qtodo-check-'));
const env = { ...process.env, TODO_FILE: join(dir, 'todos.json') };
const todo = (...args) => spawnSync(process.execPath, [join(HERE, 'todo.mjs'), ...args], { env, encoding: 'utf8' });

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).trim().slice(0, 200)}`);
  if (!ok) fails++;
};

const a1 = todo('add', 'buy milk');
check('add exits 0', a1.status === 0, a1.stderr);
todo('add', 'write report');

const d = todo('done', '1');
check('`done 1` exits 0', d.status === 0, d.stderr || d.stdout);

const l = todo('list');
check('list exits 0', l.status === 0, l.stderr);
check('item 1 shows [x] after done', /^1\. \[x\] buy milk$/m.test(l.stdout), l.stdout);
check('item 2 still shows [ ]', /^2\. \[ \] write report$/m.test(l.stdout), l.stdout);

const bad = todo('done', '99');
check('`done` on an unknown id fails with a clear error', bad.status !== 0 && /no such|unknown|not found/i.test(bad.stderr + bad.stdout), `exit ${bad.status}: ${bad.stderr || bad.stdout}`);

rmSync(dir, { recursive: true, force: true });
if (fails) { console.error(`${fails} check(s) failing`); process.exit(1); }
console.log('ALL CHECKS PASS');
