// openspec kanban-external-owner: the Owner section and the external Board check — a card
// owned by a DIFFERENT human developer says so, names them, dates it, and wins over every
// other status (it is not ours to judge). Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, boardCheckOf } from './cardSections.js';

const now = 1_800_000_000_000;

test('ownerOf: null while the card is ours; the name, the time and the source when it is theirs', () => {
  assert.equal(ownerOf({}), null);
  assert.equal(ownerOf({ externalOwner: '   ' }), null);
  assert.equal(ownerOf(null), null);
  const o = ownerOf({ externalOwner: ' Jane Doe (Acme) ', externalOwnerAt: now - 60_000 });
  assert.equal(o.key, 'external');
  assert.equal(o.name, 'Jane Doe (Acme)');
  assert.equal(o.word, 'Jane Doe (Acme) (external)');
  assert.match(o.text, /out of our domain/);
  assert.equal(o.source, 'operator');
  assert.equal(o.sourceLabel, 'you (operator)');
  assert.equal(o.at, now - 60_000);
});

test('board check: an external owner wins over manual, needs human and not-verified, and is never resolvable', () => {
  const theirs = boardCheckOf({ externalOwner: 'Jane', externalOwnerAt: now, manual: true, needsHuman: { by: 'policeman', reason: 'stuck', at: now }, status: 'pr-opened', verifiedStatus: 'doing', warning: 'claimed pr-opened' });
  assert.equal(theirs.key, 'external');
  assert.equal(theirs.word, 'External owner');
  assert.match(theirs.text, /^Jane owns this card — not ours to judge/);
  assert.equal(theirs.source, 'operator');
  assert.equal(theirs.at, now);
  assert.equal(theirs.resolvable, false);
  // Without the owner the same card is what it always was.
  assert.equal(boardCheckOf({ manual: true }).key, 'manual');
  assert.equal(boardCheckOf({ needsHuman: { by: 'policeman' } }).key, 'needs-human');
  assert.equal(boardCheckOf({ status: 'todo' }).key, 'honest');
});
