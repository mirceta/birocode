import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, getRepoId, setRepoId } from '../api/client';

// Holds the list of repositories the operator has configured and which one this
// device has selected. The selection is per-client (persisted to localStorage
// and sent as X-Repo-Id on every request), so two phones can work in different
// projects at once. Mounted above ChatProvider so a repo switch can reset the
// conversation. Loaded after the password gate, since /api/repos needs auth.
const RepoContext = createContext(null);

export function useRepo() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepo must be used within a <RepoProvider>');
  return ctx;
}

export function RepoProvider({ children }) {
  const [repos, setRepos] = useState([]);
  const [currentRepoId, setCurrentRepoIdState] = useState(() => getRepoId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Persist + apply a selection so the next request carries the new X-Repo-Id.
  const selectRepo = useCallback((id) => {
    setRepoId(id);
    setCurrentRepoIdState(id || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiGet('/repos');
      const list = Array.isArray(data) ? data : [];
      setRepos(list);

      // Self-heal: if nothing is selected, or the stored id is no longer in the
      // list (repo removed on the host), fall back to the first repo.
      const stored = getRepoId();
      const valid = list.some((r) => r.id === stored);
      if (!valid) selectRepo(list.length > 0 ? list[0].id : '');
      else setCurrentRepoIdState(stored);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectRepo]);

  useEffect(() => {
    load();
  }, [load]);

  const current = repos.find((r) => r.id === currentRepoId) || null;

  const value = {
    repos,
    currentRepoId,
    current,
    loading,
    error,
    selectRepo,
    reloadRepos: load,
  };

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}
