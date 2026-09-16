// fleet task 576ead63: the inline card editors' pure rules — a savable title, the
// keyboard contract (Enter / Esc in the title input; Ctrl+Enter / Esc in the description
// textarea), and change detection so a no-op edit never PATCHes. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, cleanNote, editKey, titleChanged, noteChanged } from './cardEdit.js';

test('cleanTitle trims and refuses a blank title (the server refuses it too)', () => {
  assert.equal(cleanTitle('  Export the invoice register as CSV  '), 'Export the invoice register as CSV');
  assert.equal(cleanTitle('   '), null);
  assert.equal(cleanTitle(''), null);
  assert.equal(cleanTitle(null), null);
});

test('cleanNote trims; an empty draft means "clear the description"', () => {
  assert.equal(cleanNote('  two\nlines  '), 'two\nlines');
  assert.equal(cleanNote(null), '');
});

test('editKey: title input — Enter saves, Esc cancels, other keys nothing, IME Enter ignored', () => {
  assert.equal(editKey({ key: 'Enter' }, 'input'), 'save');
  assert.equal(editKey({ key: 'Escape' }, 'input'), 'cancel');
  assert.equal(editKey({ key: 'a' }, 'input'), null);
  assert.equal(editKey({ key: 'Enter', isComposing: true }, 'input'), null);
  assert.equal(editKey(null), null);
});

test('editKey: description textarea — plain Enter is a newline, Ctrl/⌘+Enter saves, Esc cancels', () => {
  assert.equal(editKey({ key: 'Enter' }, 'textarea'), null);
  assert.equal(editKey({ key: 'Enter', ctrlKey: true }, 'textarea'), 'save');
  assert.equal(editKey({ key: 'Enter', metaKey: true }, 'textarea'), 'save');
  assert.equal(editKey({ key: 'Escape' }, 'textarea'), 'cancel');
});

test('titleChanged / noteChanged: only a real change warrants a PATCH', () => {
  assert.equal(titleChanged('same', 'same'), false);
  assert.equal(titleChanged('  same ', 'same'), false);
  assert.equal(titleChanged('', 'same'), false);        // blank is not a change, it is refused
  assert.equal(titleChanged('readable name', 'a1b2c3'), true);
  assert.equal(noteChanged('', null), false);
  assert.equal(noteChanged('', 'had text'), true);      // clearing is a change
  assert.equal(noteChanged('x', 'x '), false);
});
