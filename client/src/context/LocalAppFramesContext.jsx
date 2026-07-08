import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDock } from './DockContext';
import { useRepo } from './RepoContext';

// Keep-alive registry for embedded local-app frames (openspec
// local-app-state-preserve). The browser reloads an iframe whenever its DOM
// node is re-parented or unmounted, so navigation used to wipe the embedded
// app's state. Instead, every local-app iframe now lives for its whole life
// inside one root-mounted host (<LocalAppFrameHost>), and the surfaces
// (Local tab, agent docks) only render a placeholder SLOT they register
// here. The host projects the live frame over the visible slot's rect and
// hides frames whose slot is gone — hidden, never unmounted, so the app is
// exactly where the user left it on return.
//
// One frame per (surface instance, app): keys are `local:<repoId>:<appId>`
// and `dock:<dockId>:<repoId>:<appId>`. Zoom + reload state live ON the
// frame so they survive navigation too. Everything here is plain in-memory
// React state by spec — a page reload starts clean.

const MAX_FRAMES = 6; // LRU cap; least-recently-visible hidden frame evicted

const LocalAppFramesContext = createContext(null);

export function useLocalAppFrames() {
  const ctx = useContext(LocalAppFramesContext);
  if (!ctx) throw new Error('useLocalAppFrames must be used within a <LocalAppFramesProvider>');
  return ctx;
}

// ProductFrame is also used on surfaces that live OUTSIDE the provider (the
// public Landing page) — those never pass a frameKey and must not throw.
export function useLocalAppFramesMaybe() {
  return useContext(LocalAppFramesContext);
}

export function LocalAppFramesProvider({ children }) {
  // frameKey -> { url, port, meta, slotEl, zoom, reloadKey, bust, lastVisibleAt }
  // meta: { kind: 'local'|'dock', dockId?, repoId, appId, pinned } — kept as
  // data so the release rules below never have to parse keys.
  const [frames, setFrames] = useState({});

  // A surface's slot came online: create the frame if it's new (evicting the
  // least-recently-visible hidden frame past the cap), or just re-point the
  // existing one at the slot. `url` is fixed for the frame's lifetime — app
  // switching registers a DIFFERENT key rather than renaming this one, which
  // is what kills the old src-reassignment reload.
  const acquireFrame = useCallback((frameKey, { url, port, meta, slotEl }) => {
    setFrames((prev) => {
      const now = Date.now();
      const existing = prev[frameKey];
      if (existing) {
        return { ...prev, [frameKey]: { ...existing, slotEl, port, lastVisibleAt: now } };
      }
      const next = { ...prev };
      const keys = Object.keys(next);
      if (keys.length >= MAX_FRAMES) {
        // Evict among hidden, non-pinned frames only (the Local tab's
        // Understanding app is pinned — it's the convention-bearing surface).
        // If everything is visible/pinned we exceed the cap rather than
        // yanking a frame out from under the user.
        const evictable = keys
          .filter((k) => !next[k].slotEl && !next[k].meta?.pinned)
          .sort((a, b) => next[a].lastVisibleAt - next[b].lastVisibleAt);
        if (evictable.length > 0) delete next[evictable[0]];
      }
      next[frameKey] = { url, port, meta, slotEl, zoom: 1, reloadKey: 0, bust: 0, lastVisibleAt: now };
      return next;
    });
  }, []);

  // The slot unmounted (navigation away) — hide the frame, keep it alive.
  // The element guard keeps a stale cleanup (StrictMode re-runs, re-renders)
  // from unhooking a newer registration of the same key.
  const releaseSlot = useCallback((frameKey, slotEl) => {
    setFrames((prev) => {
      const f = prev[frameKey];
      if (!f || f.slotEl !== slotEl) return prev;
      return { ...prev, [frameKey]: { ...f, slotEl: null, lastVisibleAt: Date.now() } };
    });
  }, []);

  // Fully drop frames whose owning context is gone (repo switched, dock
  // removed, app deleted) — the release rules of the spec.
  const releaseFrames = useCallback((predicate) => {
    setFrames((prev) => {
      const doomed = Object.keys(prev).filter((k) => predicate(prev[k], k));
      if (doomed.length === 0) return prev;
      const next = { ...prev };
      doomed.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  // Explicit reload of ONE frame: a new iframe key remounts the node, and the
  // cache-bust query keeps the expose-freshness contract the Local tab's
  // Refresh always had (plans/expose-freshness.md).
  const refreshFrame = useCallback((frameKey) => {
    setFrames((prev) => {
      const f = prev[frameKey];
      if (!f) return prev;
      return { ...prev, [frameKey]: { ...f, reloadKey: f.reloadKey + 1, bust: Date.now() } };
    });
  }, []);

  const setZoom = useCallback((frameKey, zoom) => {
    setFrames((prev) => {
      const f = prev[frameKey];
      if (!f || f.zoom === zoom) return prev;
      return { ...prev, [frameKey]: { ...f, zoom } };
    });
  }, []);

  // --- Release rules, driven off the app's own state ---

  const { repos, current } = useRepo();
  const { tabs: dockTabs, loaded: dockLoaded } = useDock();

  // The Local tab always shows the globally selected repo, so a repo switch
  // orphans every `local:` frame of the previous repo.
  const currentRepoId = current?.id || null;
  useEffect(() => {
    releaseFrames((f) => f.meta?.kind === 'local' && f.meta.repoId !== currentRepoId);
  }, [currentRepoId, releaseFrames]);

  // Dock removed from the roster → its frames go with it. Gated on `loaded`
  // so the pre-fetch empty tab list can't mass-release.
  useEffect(() => {
    if (!dockLoaded) return;
    const ids = new Set(dockTabs.map((t) => t.id));
    releaseFrames((f) => f.meta?.kind === 'dock' && !ids.has(f.meta.dockId));
  }, [dockTabs, dockLoaded, releaseFrames]);

  // App removed from its repo's app list → release its frames everywhere.
  // Guarded on a non-empty repo list (transiently empty during load).
  useEffect(() => {
    if (!repos || repos.length === 0) return;
    const valid = new Set();
    repos.forEach((r) => (r.localApps || []).forEach((a) => valid.add(`${r.id}:${a.id}`)));
    releaseFrames((f) => f.meta && !valid.has(`${f.meta.repoId}:${f.meta.appId}`));
  }, [repos, releaseFrames]);

  const value = useMemo(
    () => ({ frames, acquireFrame, releaseSlot, releaseFrames, refreshFrame, setZoom }),
    [frames, acquireFrame, releaseSlot, releaseFrames, refreshFrame, setZoom],
  );

  return <LocalAppFramesContext.Provider value={value}>{children}</LocalAppFramesContext.Provider>;
}
