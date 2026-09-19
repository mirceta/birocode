// node --test — the File System tab's tree (openspec hubfs-large-files-tree): slashes become
// folder levels, folders carry counts / bytes / latest, collapsing hides a subtree, folders
// sort before files, a file at the root stays at the root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, flattenTree, folderPaths, toggleCollapsed } from './fileTree.js';

const files = [
  { path: 'prg/fixtures/customers.json', size: 100, updatedAt: 5 },
  { path: 'prg/fixtures/orders.json', size: 200, updatedAt: 9 },
  { path: 'prg/readme.md', size: 10, updatedAt: 1 },
  { path: 'web/db/prod.bak', size: 5_000_000_000, updatedAt: 7 },
  { path: 'notes.txt', size: 3, updatedAt: 2 },
];

test('buildTree folds slashes into folders with counts, bytes and the latest change', () => {
  const root = buildTree(files);
  assert.deepEqual(root.folders.map((d) => d.name), ['prg', 'web']);
  assert.deepEqual(root.files.map((f) => f.name), ['notes.txt']);
  const prg = root.folders[0];
  assert.equal(prg.path, 'prg');
  assert.equal(prg.count, 3);
  assert.equal(prg.bytes, 310);
  assert.equal(prg.latest, 9);
  assert.deepEqual(prg.folders.map((d) => d.path), ['prg/fixtures']);
  assert.equal(prg.folders[0].count, 2);
  assert.deepEqual(prg.files.map((f) => f.name), ['readme.md']);
  assert.equal(root.folders[1].folders[0].path, 'web/db');
  assert.equal(root.folders[1].bytes, 5_000_000_000);
  assert.equal(root.count, 5);
  assert.deepEqual(buildTree([]).folders, []);
});

test('flattenTree lists folders before files at each level and hides collapsed subtrees', () => {
  const root = buildTree(files);
  const all = flattenTree(root);
  assert.deepEqual(all.map((r) => (r.type === 'folder' ? `D${r.depth}:${r.node.path}` : `F${r.depth}:${r.file.path}`)), [
    'D0:prg', 'D1:prg/fixtures', 'F2:prg/fixtures/customers.json', 'F2:prg/fixtures/orders.json', 'F1:prg/readme.md',
    'D0:web', 'D1:web/db', 'F2:web/db/prod.bak', 'F0:notes.txt',
  ]);
  const collapsed = new Set(['prg']);
  const some = flattenTree(root, collapsed);
  assert.deepEqual(some.map((r) => (r.type === 'folder' ? `${r.node.path}${r.open ? '' : '(closed)'}` : r.file.path)), ['prg(closed)', 'web', 'web/db', 'web/db/prod.bak', 'notes.txt']);
  assert.deepEqual(folderPaths(root), ['prg', 'prg/fixtures', 'web', 'web/db']);
  const t = toggleCollapsed(collapsed, 'web/db');
  assert.deepEqual([...t], ['prg', 'web/db']);
  assert.deepEqual([...toggleCollapsed(t, 'prg')], ['web/db']);
  assert.equal(collapsed.size, 1); // never mutated
});
