// The model catalogue behind the chat's model picker (openspec codex-account-and-models):
// two families, one per engine. Picking a model implies its engine — a `gpt-*` model runs
// the repo agent on Codex, a `claude-*` model on Claude — and the picker keeps the repo's
// persisted Engine in step (see ChatContext.changeModel). Pure, no React: node-testable.

export const CLAUDE = 'claude';
export const CODEX = 'codex';

export const MODEL_GROUPS = [
  {
    provider: CLAUDE,
    labelKey: 'model.group.claude',
    models: [
      { id: 'claude-fable-5-1', label: 'Fable 5.1' },
      { id: 'claude-fable-5', label: 'Fable 5' },
      { id: 'claude-opus-4-8', label: 'Opus 4.8' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7' },
      { id: 'claude-opus-4-6', label: 'Opus 4.6' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    ],
  },
  {
    provider: CODEX,
    labelKey: 'model.group.codex',
    // FALLBACK only. The codex models an account may actually run vary by plan, and a
    // guessed slug 401s at turn time (verified: on a Pro-lite plan only gpt-6-astra
    // runs). The real list comes from the account itself — GET /api/codex-usage's
    // `models` (the model_usage map) — merged in by the selector; this single entry is
    // the CLI's own default and the fallback when the probe is unavailable.
    models: [
      { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    ],
  },
];

// Prettify a codex model slug for display: gpt-6-astra → "GPT-6 Astra",
// gpt-5.4-mini → "GPT-5.4 mini". Unknown shapes pass through title-cased.
export function prettyModel(id) {
  const known = ALL_MODELS.find((m) => m.id === id);
  if (known) return known.label;
  const s = String(id || '');
  if (!s) return id;
  return s
    .split('-')
    .map((p) => (/^gpt$/i.test(p) ? 'GPT' : /^o\d/i.test(p) ? p : /^[a-z]/.test(p) ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

// The codex group's models for the picker: the account's real list when known,
// else the static fallback. Deduped, fallback default first.
export function codexModels(available) {
  const fallback = MODEL_GROUPS.find((g) => g.provider === CODEX).models;
  if (!Array.isArray(available) || available.length === 0) return fallback;
  const ids = [...new Set([...fallback.map((m) => m.id).filter((id) => available.includes(id)), ...available])];
  return ids.map((id) => ({ id, label: prettyModel(id) }));
}

export const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models.map((m) => ({ ...m, provider: g.provider })));

// Which engine a model id belongs to. Mirrors AgentProviders.ProviderOfModel on the
// server: claude-* → claude; gpt-*, codex*, o3*, o4* → codex; unknown → null.
export function providerOf(modelId) {
  const m = String(modelId || '').trim().toLowerCase();
  if (!m) return null;
  if (m.startsWith('claude')) return CLAUDE;
  if (m.startsWith('gpt-') || m.startsWith('codex') || m === 'o3' || m.startsWith('o3-') || m === 'o4' || m.startsWith('o4-')) return CODEX;
  return null;
}

// The first model of a family — what the picker shows when the stored choice belongs
// to the other engine.
export function defaultModelFor(provider) {
  const g = MODEL_GROUPS.find((x) => x.provider === (provider === CODEX ? CODEX : CLAUDE)) || MODEL_GROUPS[0];
  return g.models[0].id;
}

// The model the composer actually sends for a repo: the stored choice when it is of
// the repo's engine family (or of no known family), else that engine's default. So a
// codex repo never receives a Claude id the user picked for another project, and vice
// versa — the server also drops a mismatched model, this keeps the picker honest.
export function effectiveModelFor(storedModel, repoProvider) {
  const family = providerOf(storedModel);
  const engine = repoProvider === CODEX ? CODEX : CLAUDE;
  if (!family || family === engine) return storedModel || defaultModelFor(engine);
  return defaultModelFor(engine);
}
