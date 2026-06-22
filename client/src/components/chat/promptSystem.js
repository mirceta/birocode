// Per-repo planning-system choice for the built-in composer prompts
// (openspec/changes/prompt-system-toggle). Device-local, keyed by repo id, so a
// repository still on the old planning system keeps the legacy built-in prompts
// until it ports. Mirrors the other per-device prefs (zoom/layout/Simple-Advanced).
const PREFIX = 'claudeweb_prompt_system:';
export const DEFAULT_SYSTEM = 'openspec'; // canonical convention; old repos opt down

export function getPromptSystem(repoId) {
  if (!repoId) return DEFAULT_SYSTEM;
  try {
    const v = localStorage.getItem(PREFIX + repoId);
    return v === 'old' || v === 'openspec' ? v : DEFAULT_SYSTEM;
  } catch {
    return DEFAULT_SYSTEM;
  }
}

export function setPromptSystem(repoId, system) {
  if (!repoId) return;
  try { localStorage.setItem(PREFIX + repoId, system); } catch { /* private mode */ }
}
