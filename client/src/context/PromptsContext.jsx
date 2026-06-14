import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';

// User-defined composer prompt presets (plans/custom-prompts.md). GLOBAL +
// backend-synced (/api/prompts) — the user's personal prompt library, shared by
// every chat composer, so we fetch once here rather than per-ChatInput.
const PromptsContext = createContext(null);

export function usePrompts() {
  const ctx = useContext(PromptsContext);
  if (!ctx) throw new Error('usePrompts must be used within a <PromptsProvider>');
  return ctx;
}

export function PromptsProvider({ children }) {
  const [prompts, setPrompts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await apiGet('/prompts');
      if (Array.isArray(list)) setPrompts(list);
    } catch {
      /* leave the current list; the manager surfaces write errors itself */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addPrompt = useCallback(async (emoji, label, text) => {
    const p = await apiPost('/prompts', { emoji, label, text });
    setPrompts((cur) => [...cur, p]);
    return p;
  }, []);

  const updatePrompt = useCallback(async (id, emoji, label, text) => {
    const p = await apiPatch(`/prompts/${id}`, { emoji, label, text });
    setPrompts((cur) => cur.map((x) => (x.id === id ? p : x)));
    return p;
  }, []);

  const deletePrompt = useCallback(async (id) => {
    await apiDelete(`/prompts/${id}`);
    setPrompts((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const value = { prompts, refresh, addPrompt, updatePrompt, deletePrompt };
  return <PromptsContext.Provider value={value}>{children}</PromptsContext.Provider>;
}
