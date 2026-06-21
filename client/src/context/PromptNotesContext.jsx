import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';

// User-defined prompt NOTES — freeform working notes drafted before being ported
// into a prompt PLAN. The third sibling of PromptsContext / PromptPlansContext:
// GLOBAL + backend-synced (/api/prompt-notes), shared by every chat composer, so we
// fetch once here. A note is { id, title, body }. Distinct from the Ideas store.
const PromptNotesContext = createContext(null);

export function usePromptNotes() {
  const ctx = useContext(PromptNotesContext);
  if (!ctx) throw new Error('usePromptNotes must be used within a <PromptNotesProvider>');
  return ctx;
}

export function PromptNotesProvider({ children }) {
  const [notes, setNotes] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await apiGet('/prompt-notes');
      if (Array.isArray(list)) setNotes(list);
    } catch {
      /* leave the current list; the manager surfaces write errors itself */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addNote = useCallback(async (title, body) => {
    const n = await apiPost('/prompt-notes', { title, body });
    setNotes((cur) => [...cur, n]);
    return n;
  }, []);

  const updateNote = useCallback(async (id, title, body) => {
    const n = await apiPatch(`/prompt-notes/${id}`, { title, body });
    setNotes((cur) => cur.map((x) => (x.id === id ? n : x)));
    return n;
  }, []);

  const deleteNote = useCallback(async (id) => {
    await apiDelete(`/prompt-notes/${id}`);
    setNotes((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const value = { notes, refresh, addNote, updateNote, deleteNote };
  return <PromptNotesContext.Provider value={value}>{children}</PromptNotesContext.Provider>;
}
