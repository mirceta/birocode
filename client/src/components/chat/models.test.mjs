// openspec codex-account-and-models: the model catalogue's engine mapping — pure,
// mirrors AgentProviders.ProviderOfModel on the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_GROUPS, ALL_MODELS, providerOf, defaultModelFor, effectiveModelFor, prettyModel, codexModels, isValidModelId, rememberCustomModel, CLAUDE, CODEX } from './models.js';

test('two groups, every model carries its engine, ids unique', () => {
  assert.deepEqual(MODEL_GROUPS.map((g) => g.provider), [CLAUDE, CODEX]);
  assert.equal(new Set(ALL_MODELS.map((m) => m.id)).size, ALL_MODELS.length);
  for (const m of ALL_MODELS) assert.equal(providerOf(m.id), m.provider, m.id);
});

test('Opus 5.5 is in the catalogue (fleet task 28278f6c), newest-first order kept', () => {
  const claude = MODEL_GROUPS.find((g) => g.provider === CLAUDE).models.map((m) => m.id);
  assert.ok(claude.includes('claude-opus-5-5'));
  // Mythos-class Fables lead, then the Claude 5 Opus, then the 4.x line.
  assert.ok(claude.indexOf('claude-opus-5-5') > claude.indexOf('claude-fable-5'));
  assert.ok(claude.indexOf('claude-opus-5-5') < claude.indexOf('claude-opus-4-8'));
  assert.equal(prettyModel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(providerOf('claude-opus-5-5'), CLAUDE);
});

// ---- free-text ids (fleet task 28278f6c, openspec model-free-text) ---------------------

test('isValidModelId: shape only — non-empty, one word; the provider judges the rest', () => {
  assert.ok(isValidModelId('claude-opus-5-5'));
  assert.ok(isValidModelId('some-brand-new-model.v2'));
  assert.ok(isValidModelId('  padded-is-trimmed  '));
  assert.ok(!isValidModelId(''));
  assert.ok(!isValidModelId('   '));
  assert.ok(!isValidModelId('two words'));
  assert.ok(!isValidModelId(null));
  assert.ok(!isValidModelId('smart—dash'));   // non-ASCII punctuation is a typo, not an id
});

test('rememberCustomModel: newest first, deduped, capped, catalogue ids not remembered twice', () => {
  let list = rememberCustomModel([], 'claude-new-1');
  list = rememberCustomModel(list, 'claude-new-2');
  assert.deepEqual(list, ['claude-new-2', 'claude-new-1']);
  assert.deepEqual(rememberCustomModel(list, 'claude-new-1'), ['claude-new-1', 'claude-new-2']); // re-use moves to front
  assert.deepEqual(rememberCustomModel(list, 'claude-opus-5-5'), list);  // already in the catalogue
  assert.deepEqual(rememberCustomModel(list, 'bad id'), list);           // invalid: unchanged
  let six = [];
  for (let i = 0; i < 9; i += 1) six = rememberCustomModel(six, `m-${i}`);
  assert.equal(six.length, 6);
  assert.equal(six[0], 'm-8');
});

test('codexModels: account list when known, static fallback otherwise', () => {
  assert.deepEqual(codexModels(null).map((m) => m.id), ['gpt-6-astra']); // probe unavailable
  assert.deepEqual(codexModels([]).map((m) => m.id), ['gpt-6-astra']);
  const acct = codexModels(['gpt-6-astra', 'gpt-5.6', 'gpt-5.6-pro']);
  assert.deepEqual(acct.map((m) => m.id), ['gpt-6-astra', 'gpt-5.6', 'gpt-5.6-pro']);
  assert.equal(acct[0].label, 'GPT-6 Astra'); // known id keeps its curated label
  assert.equal(acct[1].label, 'GPT 5.6');     // unknown slug gets the prettifier
});

test('prettyModel: slugs to labels', () => {
  assert.equal(prettyModel('gpt-6-astra'), 'GPT-6 Astra'); // known id keeps its label
  assert.equal(prettyModel('gpt-5.6'), 'GPT 5.6');
  assert.equal(prettyModel('claude-fable-5-1'), 'Fable 5.1');
});

test('providerOf: claude-* → claude; gpt-*, codex*, o3/o4 → codex; unknown → null', () => {
  assert.equal(providerOf('claude-fable-5-1'), CLAUDE);
  assert.equal(providerOf('gpt-6-astra'), CODEX);
  assert.equal(providerOf('gpt-5.4-mini'), CODEX);
  assert.equal(providerOf('o3'), CODEX);
  assert.equal(providerOf('o4-mini'), CODEX);
  assert.equal(providerOf('codex-mini-latest'), CODEX);
  assert.equal(providerOf('llama-3'), null);
  assert.equal(providerOf(''), null);
  assert.equal(providerOf(undefined), null);
});

test('defaultModelFor: first model of the family; codex default is the CLI default gpt-6-astra', () => {
  assert.equal(defaultModelFor(CLAUDE), 'claude-fable-5-1');
  assert.equal(defaultModelFor(CODEX), 'gpt-6-astra');
  assert.equal(defaultModelFor('anything-else'), 'claude-fable-5-1');
});

test('effectiveModelFor: a stored Claude id on a codex repo becomes the codex default, and vice versa', () => {
  assert.equal(effectiveModelFor('claude-opus-4-8', CODEX), 'gpt-6-astra');
  assert.equal(effectiveModelFor('gpt-5.6', CLAUDE), 'claude-fable-5-1');
  assert.equal(effectiveModelFor('gpt-5.6', CODEX), 'gpt-5.6');
  assert.equal(effectiveModelFor('claude-opus-4-8', CLAUDE), 'claude-opus-4-8');
  assert.equal(effectiveModelFor('', CODEX), 'gpt-6-astra');
  assert.equal(effectiveModelFor('mystery-model', CODEX), 'mystery-model'); // unknown family: the CLI decides
});
