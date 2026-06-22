import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';

// The user's prompt NOTES — a SINGLE freeform scratch canvas drafted before being
// ported into a prompt PLAN. The third sibling of PromptsContext / PromptPlansContext:
// GLOBAL + backend-synced (/api/prompt-notes), shared by every chat composer, so we
// fetch the canvas once here. One document (a string), not a list. Distinct from the
// Ideas store.
const PromptNotesContext = createContext(null);

export function usePromptNotes() {
  const ctx = useContext(PromptNotesContext);
  if (!ctx) throw new Error('usePromptNotes must be used within a <PromptNotesProvider>');
  return ctx;
}

export function PromptNotesProvider({ children }) {
  const [text, setText] = useState('');
  // loaded gates the editor so an in-flight initial fetch can't be clobbered by an
  // autosave of the still-empty default (which would wipe the stored canvas).
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet('/prompt-notes');
      if (res && typeof res.text === 'string') setText(res.text);
    } catch {
      /* leave the current text; the panel surfaces write errors itself */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Persist the whole canvas. Returns the stored value so the panel can confirm.
  const saveNotes = useCallback(async (next) => {
    const res = await apiPut('/prompt-notes', { text: next });
    const stored = res && typeof res.text === 'string' ? res.text : next;
    setText(stored);
    return stored;
  }, []);

  const value = { text, loaded, refresh, saveNotes };
  return <PromptNotesContext.Provider value={value}>{children}</PromptNotesContext.Provider>;
}
