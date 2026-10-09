import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import { MODEL_GROUPS, ALL_MODELS, codexModels, isValidModelId, rememberCustomModel, CLAUDE, CODEX } from './models';

const MODEL_KEY = 'claudeweb_model';
const CUSTOM_KEY = 'claudeweb_custom_models';
// The <option> that reveals the free-text input — never a real model id.
const CUSTOM_SENTINEL = '__custom__';

export function getModel() {
  return localStorage.getItem(MODEL_KEY) || ALL_MODELS[0].id;
}

export function setModel(id) {
  localStorage.setItem(MODEL_KEY, id);
}

function readCustoms() {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(v) ? v.filter(isValidModelId) : [];
  } catch { return []; }
}
function saveCustoms(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

// The account's real codex models, fetched once and shared across every selector
// mount (the list is host-global, not per-render). Null until the first fetch.
let codexModelsCache = null;

// Model picker for the chat composer: one dropdown, two engine families (openspec
// codex-account-and-models). The Claude family is static; the Codex family is the
// models THIS account may actually run (GET /api/codex-usage → models), so the picker
// never offers a slug that 401s at turn time — it falls back to the CLI default when
// the probe is unavailable. Choosing a model from the other family switches the repo's
// Engine (ChatContext.changeModel does the POST), so the picker and the dock's Engine
// select always agree. `value` is the EFFECTIVE model for the active repo.
//
// FREE-TEXT ids (fleet task 28278f6c, openspec model-free-text): the Custom group holds
// the device's recently used ids plus "Custom model id…", which reveals a text input —
// type any id (shape-checked only: non-empty, no whitespace) and it is used, persisted
// and remembered exactly like a picked one, so a brand-new model release never needs a
// harness task + fleet redeploy. A current value the catalogue does not know is shown
// as-is in that group. If the provider rejects the id, the turn's own error says so in
// the chat — the CLI is the judge, not this list.
export default function ModelSelector({ value, onChange }) {
  const visible = useFeature('modelSelector');
  const { t } = useT();
  const [codex, setCodex] = useState(codexModelsCache);
  const [customs, setCustoms] = useState(readCustoms);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!visible || codexModelsCache) return;
    let alive = true;
    (async () => {
      try {
        const usage = await apiGet('/codex-usage');
        const models = codexModels(usage?.available ? usage.models : null);
        codexModelsCache = models;
        if (alive) setCodex(models);
      } catch {
        /* leave the static fallback */
      }
    })();
    return () => { alive = false; };
  }, [visible]);
  if (!visible) return null;

  const groups = MODEL_GROUPS.map((g) =>
    g.provider === CODEX ? { ...g, models: codex || g.models } : g);
  const knownIds = new Set([...groups.flatMap((g) => g.models.map((m) => m.id)), ...customs]);
  const strayValue = value && !knownIds.has(value) ? value : null;

  const commit = () => {
    const id = draft.trim();
    if (!isValidModelId(id)) return;
    const next = rememberCustomModel(customs, id);
    setCustoms(next);
    saveCustoms(next);
    setEditing(false);
    onChange(id);
  };
  const draftOk = isValidModelId(draft);

  return (
    <>
      <select
        className="chat__model"
        value={editing ? CUSTOM_SENTINEL : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_SENTINEL) { setDraft(''); setEditing(true); return; }
          setEditing(false);
          onChange(e.target.value);
        }}
        aria-label="Model"
        data-model-select
      >
        {groups.map((g) => (
          <optgroup key={g.provider} label={t(g.labelKey)} data-provider={g.provider}>
            {g.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </optgroup>
        ))}
        <optgroup label={t('model.group.custom')} data-provider="custom">
          {customs.map((id) => <option key={id} value={id}>{id}</option>)}
          {strayValue && <option value={strayValue}>{strayValue}</option>}
          <option value={CUSTOM_SENTINEL}>{t('model.customOption')}</option>
        </optgroup>
      </select>
      {editing && (
        <span className="chat__model-custom" data-model-custom>
          <input
            type="text"
            className="chat__model-custom-input"
            value={draft}
            autoFocus
            placeholder={t('model.customPlaceholder')}
            aria-label={t('model.customOption')}
            aria-invalid={draft.length > 0 && !draftOk ? true : undefined}
            title={draftOk || draft.length === 0 ? t('model.customHint') : t('model.customInvalid')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
            }}
            data-model-custom-input
          />
          <button type="button" className="chat__model-custom-apply" disabled={!draftOk} onClick={commit} title={draftOk ? t('model.customUseTitle') : t('model.customInvalid')} data-model-custom-apply>{t('model.customUse')}</button>
          <button type="button" className="chat__model-custom-cancel" onClick={() => setEditing(false)} aria-label="Cancel" title="Cancel" data-model-custom-cancel>×</button>
        </span>
      )}
    </>
  );
}

export { CLAUDE, CODEX };
