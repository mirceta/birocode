import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';

// Footer clauses (openspec prompt-footer-clauses): standing instructions appended
// to EVERY composer send while their checkbox is active. GLOBAL + backend-synced
// (/api/footer-clauses), the PromptsContext pattern — one list shared by every
// composer. Mounted ABOVE ChatProvider: the send path (ChatContext.sendTo) reads
// the active clauses at send time, so this provider must be its ancestor.
const FooterClausesContext = createContext(null);

export function useFooterClauses() {
  const ctx = useContext(FooterClausesContext);
  if (!ctx) throw new Error('useFooterClauses must be used within a <FooterClausesProvider>');
  return ctx;
}

export function FooterClausesProvider({ children }) {
  const [clauses, setClauses] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await apiGet('/footer-clauses');
      if (Array.isArray(list)) setClauses(list);
    } catch {
      /* leave the current list; the popup surfaces write errors itself */
    }
  }, []);

  // Load once at mount; the popup calls refresh() again on open so edits made
  // from another device show up without a full reload.
  useEffect(() => { refresh(); }, [refresh]);

  const addClause = useCallback(async (text, active = false) => {
    const c = await apiPost('/footer-clauses', { text, active });
    setClauses((cur) => [...cur, c]);
    return c;
  }, []);

  const updateClause = useCallback(async (id, text) => {
    const c = await apiPatch(`/footer-clauses/${id}`, { text });
    setClauses((cur) => cur.map((x) => (x.id === id ? c : x)));
    return c;
  }, []);

  // Checkbox toggle — sends ONLY the flag; the backend keeps the text.
  const toggleClause = useCallback(async (id, active) => {
    const c = await apiPatch(`/footer-clauses/${id}`, { active });
    setClauses((cur) => cur.map((x) => (x.id === id ? c : x)));
    return c;
  }, []);

  const deleteClause = useCallback(async (id) => {
    await apiDelete(`/footer-clauses/${id}`);
    setClauses((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const value = { clauses, refresh, addClause, updateClause, toggleClause, deleteClause };
  return <FooterClausesContext.Provider value={value}>{children}</FooterClausesContext.Provider>;
}
