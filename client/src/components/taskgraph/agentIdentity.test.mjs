// Fleet task 4ddcfce3: every agent carries a colour-independent identity mark — a glyph
// and a monogram — from the shared colour module, so Fleet Status and the Kanban cards
// render the identical token, stable per agent (identity, never list order), unique
// together with the hue even when hues repeat. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLYPHS, PALETTE_SIZE, abbrMachine, abbrRepo, agentKey, agentMark, assignSlots, glyphOf, hashKey, hueOf, machineKey, monogramOf, repoKey,
} from './graphColors.js';

test('monograms follow the machine-skeleton / repo-prefix scheme from the brief', () => {
  assert.equal(abbrMachine('razvoj2016'), 'rz');
  assert.equal(abbrMachine('living room'), 'lv');
  assert.equal(abbrMachine('laptop'), 'lp');
  assert.equal(abbrMachine('MONSTER'), 'mn');
  assert.equal(abbrMachine('spacex'), 'sp');
  assert.equal(abbrMachine('DESKTOP-POAPPP3'), 'ds');
  assert.equal(abbrMachine('a'), 'aa');       // degenerate: padded, never empty
  assert.equal(abbrMachine(''), '??');
  assert.equal(abbrRepo('prg'), 'prg');
  assert.equal(abbrRepo('prg#2'), 'prg2');
  assert.equal(abbrRepo('spacex/prg#2'), 'prg2'); // a full handle: the repo part only
  assert.equal(abbrRepo('web'), 'web');
  assert.equal(abbrRepo('birocode'), 'bir');
  assert.equal(abbrRepo('game-arcade'), 'ga');
  assert.equal(abbrRepo('business_research'), 'br');
  assert.equal(monogramOf('razvoj2016', 'prg#2'), 'rz/prg2');
  assert.equal(monogramOf('laptop', 'web'), 'lp/web');
});

test('the glyph is a pure function of the identity key, not of order or persistence', () => {
  const a = glyphOf('self', 'github.com/acme/app');
  const b = glyphOf('self', 'github.com/acme/app');
  assert.equal(a, b);
  assert.ok(GLYPHS.includes(a));
  assert.equal(hashKey('x'), hashKey('x'));
  assert.notEqual(hashKey('self|github.com/acme/app'), hashKey('src-B|github.com/acme/app'));
  // The same repo on another machine is another agent: its own key, its own (usually
  // different) glyph — and always its own monogram.
  assert.notEqual(agentKey('self', 'github.com/acme/app'), agentKey('src-B', 'github.com/acme/app'));
  assert.equal(GLYPHS.length, 16);
  assert.equal(new Set(GLYPHS).size, 16);
});

test('a synthetic fleet with repeated hues is still uniquely identifiable by hue + mark', () => {
  // Six machines each running the same six repos: every repo hue repeats six times
  // (one per machine) and, with 36 agents over a 12-hue palette, machine hues repeat too.
  const machines = ['razvoj2016', 'living room', 'MONSTER', 'spacex', 'DESKTOP-POAPPP3', 'laptop'];
  const repos = ['birocode', 'prg', 'web', 'game-arcade', 'business-research', 'sevda-temu'];
  const mkeys = machines.map((m, i) => (i === 0 ? 'self' : `src-${i}`));
  const rkeys = repos.map((r) => `github.com/acme/${r}`);
  const mslots = assignSlots(mkeys);
  const rslots = assignSlots(rkeys);
  const seen = new Map();
  const tokens = [];
  machines.forEach((m, mi) => repos.forEach((r, ri) => {
    const mark = agentMark(mkeys[mi], rkeys[ri], m, `${m}/${r}#1`);
    const token = `${hueOf(mslots[mkeys[mi]])}/${hueOf(rslots[rkeys[ri]])}|${mark.glyph}|${mark.monogram}`;
    tokens.push(token);
    seen.set(mark.key, mark);
  }));
  assert.equal(new Set(tokens).size, tokens.length, 'every agent has a unique hue+glyph+monogram token');
  // Colour-free identification: the monogram alone names the machine and the repo.
  const monos = [...seen.values()].map((x) => x.monogram);
  assert.equal(new Set(monos).size, monos.length, 'monograms are unique across the fleet');
  // The same repo hue is shared by six agents, so colour alone would not do.
  const perRepoHue = rkeys.map((rk) => hueOf(rslots[rk]));
  assert.equal(new Set(perRepoHue).size, repos.length);
  assert.ok(machines.length >= 6);
});

test('the mark is stable across reloads and independent of the palette slot map', () => {
  const first = agentMark('self', 'github.com/acme/prg', 'razvoj2016', 'razvoj2016/prg#2');
  // A "reload" with a different slot map (hues may change) leaves the mark untouched.
  assert.deepEqual(agentMark('self', 'github.com/acme/prg', 'razvoj2016', 'razvoj2016/prg#2'), first);
  assert.equal(first.monogram, 'rz/prg2');
  assert.equal(first.label, 'razvoj2016/prg#2');
  // A bare repo name (no handle) gets the machine prepended in the label.
  assert.equal(agentMark('self', 'id:r1', 'laptop', 'web').label, 'laptop/web');
});

test('Fleet Status and the Kanban card derive the SAME mark for one agent', () => {
  // Fleet Status: mk = "self" | sourceId, rk = repoKey({repoId}, () => a.remoteUrl),
  // labels = m.machine + a.handle. Kanban: mk/rk from the assignee via machineKey/repoKey
  // and the fleet lookup, labels from the same fleet snapshot.
  const fleetMark = agentMark('self', repoKey({ repoId: 'r1' }, () => 'git@github.com:acme/app.git'), 'living room', 'living room/app#1');
  const kanbanMark = agentMark(
    machineKey({ sourceId: null, repoId: 'r1' }),
    repoKey({ sourceId: null, repoId: 'r1' }, () => 'https://github.com/acme/app.git'),
    'living room', 'living room/app#1',
  );
  assert.deepEqual(kanbanMark, fleetMark);
  assert.equal(fleetMark.monogram, 'lv/app1');
  // And beyond the palette size (hue wrap) the mark still tells the two apart.
  const many = Array.from({ length: PALETTE_SIZE + 1 }, (_, i) => `src-${i}`);
  const slots = assignSlots(many);
  assert.equal(hueOf(slots['src-0']), hueOf(slots[`src-${PALETTE_SIZE}`]));
  assert.notEqual(agentMark('src-0', 'id:r', 'alpha', 'r').key, agentMark(`src-${PALETTE_SIZE}`, 'id:r', 'omega', 'r').key);
  assert.notEqual(agentMark('src-0', 'id:r', 'alpha', 'r').monogram, agentMark(`src-${PALETTE_SIZE}`, 'id:r', 'omega', 'r').monogram);
});
