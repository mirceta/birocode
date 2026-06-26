import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, getRepoId, setRepoId } from '../api/client';
import { useUiMode } from './UiModeContext';

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
  const { isAdvanced } = useUiMode();
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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve the active selection against what the current mode may land on.
  // Basic (End User) must never be on the harness's own Self-Development repo
  // (isSelf) or an Advanced-only repo — the same set the Projects list shows —
  // so the index-0 self default and any persisted self pick never leak the
  // harness conversation (openspec: hide-self-repo-from-basic). When the stored
  // pick isn't selectable, fall back to the first selectable repo, else the
  // empty/no-project state (''). Also self-heals when a repo is removed on the
  // host. Re-runs on mode toggle, so switching Advanced -> Basic while on the
  // self repo moves off it immediately.
  useEffect(() => {
    if (loading) return; // wait for the first /repos load
    const selectable = isAdvanced
      ? repos
      : repos.filter((r) => r.visibility === 'basic' && !r.isSelf);
    const ok = selectable.some((r) => r.id === currentRepoId);
    if (!ok) selectRepo(selectable.length > 0 ? selectable[0].id : '');
  }, [repos, isAdvanced, loading, currentRepoId, selectRepo]);

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
