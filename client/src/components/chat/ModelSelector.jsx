import { useFeature } from '../../context/UiModeContext';

const MODEL_KEY = 'claudeweb_model';

const MODELS = [
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

export function getModel() {
  return localStorage.getItem(MODEL_KEY) || MODELS[0].id;
}

export function setModel(id) {
  localStorage.setItem(MODEL_KEY, id);
}

export default function ModelSelector({ value, onChange }) {
  const visible = useFeature('modelSelector');
  if (!visible) return null;
  return (
    <select
      className="chat__model"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Model"
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>{m.label}</option>
      ))}
    </select>
  );
}
