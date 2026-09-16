// The committed Management App bundle (events-app/manage/) must be self-consistent: every
// asset its index.html references has to exist in the folder. A merge that keeps one
// side's index.html and the other side's hashed assets ships a shell whose script 404s —
// the whole Management dashboard renders blank (2026-09-16, PR #103's merge of main).
// This reads the committed files themselves, so that mismatch fails the suite before it
// can reach main. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANAGE = resolve(HERE, '..', '..', '..', 'events-app', 'manage');

test('the Management App shell references only assets that exist in the committed bundle', () => {
  const indexPath = join(MANAGE, 'index.html');
  assert.ok(existsSync(indexPath), `missing ${indexPath}`);
  const html = readFileSync(indexPath, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 2, `expected a script and a stylesheet reference, found ${refs.length}`);
  const missing = refs.filter((r) => !existsSync(join(MANAGE, r)));
  assert.deepEqual(missing, [], `index.html points at assets that are not in events-app/manage: ${missing.join(', ')} — rebuild with "npm --prefix client run build:manage" and commit the whole folder`);
  // The hashed names in the shell and on disk must agree exactly (no stale index).
  assert.ok(refs.some((r) => /assets\/manage-[A-Za-z0-9_-]+\.js$/.test(r)), 'no hashed manage-*.js reference');
  assert.ok(refs.some((r) => /assets\/manage-[A-Za-z0-9_-]+\.css$/.test(r)), 'no hashed manage-*.css reference');
});
