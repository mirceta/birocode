import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import { MODEL_GROUPS, ALL_MODELS, codexModels, CLAUDE, CODEX } from './models';

const MODEL_KEY = 'claudeweb_model';

export function getModel() {
  return localStorage.getItem(MODEL_KEY) || ALL_MODELS[0].id;
}

export function setModel(id) {
  localStorage.setItem(MODEL_KEY, id);
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
export default function ModelSelector({ value, onChange }) {
  const visible = useFeature('modelSelector');
  const { t } = useT();
  const [codex, setCodex] = useState(codexModelsCache);
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

  return (
    <select
      className="chat__model"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Model"
    >
      {groups.map((g) => (
        <optgroup key={g.provider} label={t(g.labelKey)} data-provider={g.provider}>
          {g.models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export { CLAUDE, CODEX };
