import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiGetBlob, apiPost } from '../../api/client';
import Loading from '../shared/Loading';
import ErrorBanner from '../shared/ErrorBanner';
import FileTree from './FileList';
import FileViewer from './FileViewer';
import resolvePath from '../shared/resolvePath';
import { useChat } from '../../context/ChatContext';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import './files.css';

// The shared browse-and-view engine behind the Files tab AND the dashboard's
// Files dock (plans/agent-dock-files-tab.md). It is the single file surface
// (plans/plan-files-merge.md): it opens the file you last looked at — defaulting
// to plan.md the first time — with the folder tree one tap away (the viewer's ←
// corner). Pins give quick access to the files you care about (plan.md,
// CLAUDE.md). The open file is polled live so plan.md updates as Claude edits it
// during a run. Every API call is scoped to the `repoId` prop, so the same
// component can target the globally-selected repo (the tab) or a specific
// agent's repo (the dock) without the two drifting.
const POLL_MS = 5000;
const DEFAULT_FILE = 'plan.md';
const TREE = ' tree'; // remembered-view marker: "show the tree, not a file"

// Pins are per-project and backend-synced (GET/POST /api/pins). These defaults
// are the fallback when the pins API is unreachable (e.g. before the backend is
// deployed) so the strip never breaks the browser.
const DEFAULT_PINS = ['plan.md', 'CLAUDE.md'];

const norm = (p) => (p || '').replace(/^\/+/, '');
const isPlan = (p) => p === 'plan.md' || (p || '').endsWith('/plan.md');

// IDE mode (plans/files-ide-mode.md): show/hide the folder browser is a layout
// preference, device-local and shared across repos (like the UI mode itself),
// not a per-project navigation position — so it lives under its own key.
const BROWSER_KEY = 'claudeweb_files_browser_open';
const readBrowserOpen = () => {
  try { return localStorage.getItem(BROWSER_KEY) !== '0'; } catch { return true; }
};
const writeBrowserOpen = (open) => {
  try { localStorage.setItem(BROWSER_KEY, open ? '1' : '0'); } catch { /* private mode */ }
};

// Drag-to-resize: the folder browser's width in px, device-local (a layout
// preference, like the open/closed state). null = use the CSS default clamp.
const BROWSER_WIDTH_KEY = 'claudeweb_files_browser_width';
const readBrowserWidth = () => {
  try {
    const v = parseInt(localStorage.getItem(BROWSER_WIDTH_KEY), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
};
const writeBrowserWidth = (px) => {
  try { localStorage.setItem(BROWSER_WIDTH_KEY, String(Math.round(px))); } catch { /* private mode */ }
};
const MIN_BROWSER_WIDTH = 140; // never let the browser collapse to nothing by drag
const MIN_VIEW_WIDTH = 120; // always keep this much for the file view

// Tree zoom: a font/row scale factor for the folder browser only, device-local.
const TREE_ZOOM_KEY = 'claudeweb_files_tree_zoom';
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.1;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
const readTreeZoom = () => {
  try {
    const v = parseFloat(localStorage.getItem(TREE_ZOOM_KEY));
    return Number.isFinite(v) ? clampZoom(v) : 1;
  } catch { return 1; }
};
const writeTreeZoom = (z) => {
  try { localStorage.setItem(TREE_ZOOM_KEY, String(z)); } catch { /* private mode */ }
};

// Hide C# build-output folders (bin/obj) from the tree + search, device-local.
// Default ON — they're generated noise. Toggle lives next to the zoom controls.
const HIDE_GEN_KEY = 'claudeweb_files_hide_generated';
const GENERATED_DIRS = new Set(['bin', 'obj']);
const readHideGen = () => {
  try { return localStorage.getItem(HIDE_GEN_KEY) !== '0'; } catch { return true; }
};
const writeHideGen = (on) => {
  try { localStorage.setItem(HIDE_GEN_KEY, on ? '1' : '0'); } catch { /* private mode */ }
};
// A path is generated when any segment is a build-output folder (e.g. .../bin/Debug/x.dll).
const isGeneratedPath = (path) => path.split('/').some((seg) => GENERATED_DIRS.has(seg));

// Hide C# project files (*.csproj) from the tree + search, device-local. Default
// OFF — unlike bin/obj, .csproj are meaningful source you usually want to see.
// Toggle lives next to the bin/obj toggle.
const HIDE_CSPROJ_KEY = 'claudeweb_files_hide_csproj';
const readHideCsproj = () => {
  try { return localStorage.getItem(HIDE_CSPROJ_KEY) === '1'; } catch { return false; }
};
const writeHideCsproj = (on) => {
  try { localStorage.setItem(HIDE_CSPROJ_KEY, on ? '1' : '0'); } catch { /* private mode */ }
};
const isCsprojPath = (path) => path.toLowerCase().endsWith('.csproj');

const SEARCH_LIMIT = 200; // cap rendered fuzzy results so a short query can't render thousands

// Subsequence fuzzy match: every char of the (lowercased) query must appear in
// order somewhere in the path. Returns a score (lower = tighter/earlier match)
// or null when it doesn't match. Used to rank the search results.
function fuzzyScore(query, path) {
  const q = query.toLowerCase();
  const s = path.toLowerCase();
  let qi = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < s.length && qi < q.length; i += 1) {
    if (s[i] === q[qi]) {
      if (first < 0) first = i;
      last = i;
      qi += 1;
    }
  }
  if (qi < q.length) return null;
  // Prefer matches that start early and span tightly; break ties by shorter path.
  return first * 4 + (last - first) + path.length * 0.01;
}
// Images are fetched as bytes from /files/raw (the text /read can't carry them)
// and rendered via an object URL (plans/files-image-preview.md).
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const isImage = (p) => IMAGE_RE.test(p || '');

// Remembered view is per-project and device-local — it's a navigation
// position, not content, so it stays out of the backend (unlike pins later).
const viewKey = (repoId) => `claudeweb_files_view:${repoId || 'none'}`;
const readView = (repoId) => {
  try { return localStorage.getItem(viewKey(repoId)); } catch { return null; }
};
const writeView = (repoId, value) => {
  try { localStorage.setItem(viewKey(repoId), value); } catch { /* private mode */ }
};

// `repoId` scopes every request via the api client's per-call override; when it
// is empty (e.g. the dock has no active agent) the browser shows a quiet empty
// state instead of firing repo-less calls the backend would reject.
export default function FilesBrowser({ repoId }) {
  const { t } = useT();
  const { draft, setDraft } = useChat();
  const [nodes, setNodes] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [imageUrl, setImageUrl] = useState(null); // object URL for image files
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const imgUrlRef = useRef(null); // currently-live object URL, for revocation

  // Revoke any outstanding image object URL on unmount (no leak).
  useEffect(() => () => { if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current); }, []);

  // Doc-link navigation (plans/doc-viewer.md slice 2): a history of file paths
  // visited via in-document links. Tree/pin opens reset it; ◀ ▶ move through it.
  const docLinks = useFeature('docLinks');
  const [hist, setHist] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  // Per-project pins (slice 2). Seeded from the backend; defaults on failure.
  const [pins, setPins] = useState(DEFAULT_PINS);

  // IDE mode (plans/files-ide-mode.md): one split layout — tree + fuzzy search
  // on the left, the open file on the right — used identically on the Files tab
  // and inside the agent dock. Gated behind the filesIdeMode capability.
  const ide = useFeature('filesIdeMode');
  const [browserOpen, setBrowserOpen] = useState(readBrowserOpen);
  const [query, setQuery] = useState('');
  const [allFiles, setAllFiles] = useState([]); // recursive index for fuzzy search
  const [indexTruncated, setIndexTruncated] = useState(false);
  const [indexing, setIndexing] = useState(false);

  // Adjustable folder browser (IDE mode): a drag-resizable width and a tree zoom
  // factor, both device-local prefs scoped to the left pane.
  const [browserWidth, setBrowserWidth] = useState(readBrowserWidth);
  const [treeZoom, setTreeZoom] = useState(readTreeZoom);
  const [hideGenerated, setHideGenerated] = useState(readHideGen);
  const [hideCsproj, setHideCsproj] = useState(readHideCsproj);
  const browserRef = useRef(null);
  const dragWidthRef = useRef(null); // latest width during a drag, persisted on release

  const toggleBrowser = useCallback(() => {
    setBrowserOpen((open) => { const next = !open; writeBrowserOpen(next); return next; });
  }, []);

  // Zoom the tree text/rows up or down (or reset). Persisted immediately.
  const zoomBy = useCallback((delta) => {
    setTreeZoom((z) => { const next = clampZoom(z + delta); writeTreeZoom(next); return next; });
  }, []);
  const zoomReset = useCallback(() => { setTreeZoom(1); writeTreeZoom(1); }, []);

  // Toggle hiding bin/obj (C# build output) from the tree + search. Persisted.
  const toggleHideGenerated = useCallback(() => {
    setHideGenerated((on) => { const next = !on; writeHideGen(next); return next; });
  }, []);

  // Toggle hiding *.csproj files from the tree + search. Persisted device-local.
  const toggleHideCsproj = useCallback(() => {
    setHideCsproj((on) => { const next = !on; writeHideCsproj(next); return next; });
  }, []);

  // Drag the divider between the browser and the file view. Pointer events cover
  // mouse and touch; width is clamped so the view always keeps MIN_VIEW_WIDTH.
  const onResizeDown = useCallback((e) => {
    e.preventDefault();
    const browserEl = browserRef.current;
    if (!browserEl) return;
    const startX = e.clientX;
    const startW = browserEl.getBoundingClientRect().width;
    const container = browserEl.parentElement; // .files-ide
    const move = (ev) => {
      const containerW = container ? container.getBoundingClientRect().width : Infinity;
      const maxW = Math.max(MIN_BROWSER_WIDTH, containerW - MIN_VIEW_WIDTH);
      const next = Math.min(maxW, Math.max(MIN_BROWSER_WIDTH, startW + (ev.clientX - startX)));
      dragWidthRef.current = next;
      setBrowserWidth(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      if (dragWidthRef.current != null) writeBrowserWidth(dragWidthRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Load this project's pins; fall back to defaults if the API is unavailable.
  useEffect(() => {
    if (!repoId) return undefined;
    let cancelled = false;
    apiGet('/pins', { repoId })
      .then((list) => { if (!cancelled && Array.isArray(list)) setPins(list); })
      .catch(() => { if (!cancelled) setPins(DEFAULT_PINS); });
    return () => { cancelled = true; };
  }, [repoId]);

  // IDE fuzzy search needs a whole-repo file list, not just the lazily-expanded
  // tree, so fetch a recursive index once per project. Only when IDE mode is on,
  // so Basic mode pays nothing. Reset the search box on a project switch.
  useEffect(() => {
    setQuery('');
    if (!ide || !repoId) { setAllFiles([]); setIndexTruncated(false); return undefined; }
    let cancelled = false;
    setIndexing(true);
    apiGet('/files/all', { repoId })
      .then((res) => {
        if (cancelled) return;
        setAllFiles(Array.isArray(res?.files) ? res.files : []);
        setIndexTruncated(!!res?.truncated);
      })
      .catch(() => { if (!cancelled) { setAllFiles([]); setIndexTruncated(false); } })
      .finally(() => { if (!cancelled) setIndexing(false); });
    return () => { cancelled = true; };
  }, [ide, repoId]);

  // Pin/unpin the open file; the backend returns the new set.
  async function togglePin(filePath) {
    try {
      const res = await apiPost('/pins/toggle', { path: filePath }, { repoId });
      if (Array.isArray(res?.pins)) setPins(res.pins);
    } catch { /* pins API unavailable — leave the strip as-is */ }
  }

  // Long-press a file -> drop an @reference to it into the chat composer (which
  // lives in the shared ChatProvider, so it is there when you switch to Chat).
  function referenceFile(filePath) {
    const relPath = filePath.replace(/^\/+/, '');
    const token = `@${relPath}`;
    // ChatContext's setDraft is a plain setter (per-conversation store), NOT a
    // React state setter -- passing an updater function would store the
    // function itself as the draft and crash the composer.
    const base = draft || '';
    const sep = base.length === 0 || /\s$/.test(base) ? '' : ' ';
    setDraft(`${base}${sep}${token} `);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(25); } catch { /* ignore */ }
    }
    const name = filePath.split('/').pop();
    setToast(t('files.addedToMessage', { name }));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }

  const loadDir = useCallback(async (dirPath) => {
    setNodes((prev) => ({ ...prev, [dirPath]: { entries: null, state: 'loading' } }));
    try {
      const data = await apiGet(`/files?path=${encodeURIComponent(dirPath)}`, { repoId });
      setNodes((prev) => ({
        ...prev,
        [dirPath]: { entries: Array.isArray(data) ? data : [], state: 'loaded' },
      }));
    } catch {
      setNodes((prev) => ({ ...prev, [dirPath]: { entries: null, state: 'error' } }));
    }
  }, [repoId]);

  // Open one file and remember it as this project's view (so revisiting the
  // surface reopens it). Used by the initial open, pins, the tree, and history.
  const loadFile = useCallback(async (filePath) => {
    const name = filePath.split('/').pop();
    setOpenFile({ name, path: filePath });
    setFileContent('');
    setFileError('');
    setFileLoading(true);
    writeView(repoId, filePath);
    // Drop any previous image so we never show a stale picture under a new name.
    if (imgUrlRef.current) { URL.revokeObjectURL(imgUrlRef.current); imgUrlRef.current = null; }
    setImageUrl(null);
    try {
      if (isImage(filePath)) {
        // <img> can't send X-Repo-Id, so fetch the bytes (header rides) and
        // render an object URL — same approach as the Screen tab.
        const blob = await apiGetBlob(`/files/raw?path=${encodeURIComponent(filePath)}`, { repoId });
        const url = URL.createObjectURL(blob);
        imgUrlRef.current = url;
        setImageUrl(url);
      } else {
        const data = await apiGet(`/files/read?path=${encodeURIComponent(filePath)}`, { repoId });
        setFileContent(typeof data === 'string' ? data : data.content || '');
      }
    } catch {
      setFileError(t('files.previewError'));
    } finally {
      setFileLoading(false);
    }
  }, [repoId, t]);

  // Open from the tree or a pin: start a fresh history at this file.
  const openFileAt = useCallback((filePath) => {
    setHist([filePath]);
    setHistIdx(0);
    loadFile(filePath);
  }, [loadFile]);

  // Switching projects (and first mount): rebuild the tree, then restore this
  // project's remembered view — a file path, the tree marker, or (first time)
  // the default plan.md. With no repo, clear back to an empty state.
  useEffect(() => {
    setFileError('');
    setNodes({});
    setExpanded(new Set());
    if (!repoId) {
      setOpenFile(null);
      setHist([]);
      setHistIdx(-1);
      return;
    }
    loadDir('/');
    const remembered = readView(repoId);
    if (remembered === TREE) {
      setOpenFile(null);
      setHist([]);
      setHistIdx(-1);
    } else {
      openFileAt(remembered || DEFAULT_FILE);
    }
    // Re-run only when the project changes; loadDir/openFileAt are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  // Live updates: while a file is open and the page is visible, silently
  // re-fetch its content every 5s (no loading flash) so plan.md tracks Claude's
  // edits. Paused on the tree. Mirrors the old Plan tab's poll, now per-file.
  useEffect(() => {
    const path = openFile?.path;
    if (!path || !repoId) return undefined;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (isImage(path)) {
          // Re-fetch the bytes so a re-taken screenshot updates live.
          const blob = await apiGetBlob(`/files/raw?path=${encodeURIComponent(path)}`, { repoId });
          if (!cancelled) {
            const prev = imgUrlRef.current;
            const url = URL.createObjectURL(blob);
            imgUrlRef.current = url;
            setImageUrl(url);
            if (prev) URL.revokeObjectURL(prev);
          }
        } else {
          const data = await apiGet(`/files/read?path=${encodeURIComponent(path)}`, { repoId });
          if (!cancelled) {
            setFileContent(typeof data === 'string' ? data : data.content || '');
            setFileError('');
          }
        }
      } catch { /* keep the last good content rather than flashing an error */ }
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [openFile?.path, repoId]);

  // Tap a folder row: collapse if expanded, otherwise expand and lazily fetch
  // its children (also refetches after a failed attempt).
  function toggleDir(dirPath) {
    const isExpanding = !expanded.has(dirPath);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
    const node = nodes[dirPath];
    if (isExpanding && (!node || node.state === 'error')) loadDir(dirPath);
  }

  // In-document link: resolve against the open file's folder, push history.
  function followLink(href) {
    const target = resolvePath(openFile?.path || '', href);
    if (!target || target === openFile?.path) return;
    setHist((h) => [...h.slice(0, histIdx + 1), target]);
    setHistIdx((i) => i + 1);
    loadFile(target);
  }

  function histGo(delta) {
    const i = histIdx + delta;
    if (i < 0 || i >= hist.length) return;
    setHistIdx(i);
    loadFile(hist[i]);
  }

  // ← corner: drop back to the folder tree and remember that as the view.
  function showTree() {
    setOpenFile(null);
    setFileError('');
    setFileContent('');
    if (imgUrlRef.current) { URL.revokeObjectURL(imgUrlRef.current); imgUrlRef.current = null; }
    setImageUrl(null);
    setHist([]);
    setHistIdx(-1);
    writeView(repoId, TREE);
  }

  // Fuzzy search results over the recursive index (IDE mode). Ranked by
  // fuzzyScore, capped so a one-char query can't render the whole repo.
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const scored = [];
    for (const path of allFiles) {
      if (hideGenerated && isGeneratedPath(path)) continue;
      if (hideCsproj && isCsprojPath(path)) continue;
      const score = fuzzyScore(q, path);
      if (score != null) scored.push({ path, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored;
  }, [query, allFiles, hideGenerated, hideCsproj]);

  const root = nodes['/'];

  // The viewer content for IDE mode's right pane — same states as the legacy
  // full-screen viewer, but without the "back to tree" button (the tree is
  // always present on the left).
  function renderViewerPane() {
    if (!openFile) {
      return (
        <div className="files-empty">
          <div className="files-empty__emoji" aria-hidden="true">{'\u{1F4C4}'}</div>
          <p className="files-empty__title">{t('files.pickFile')}</p>
          <p>{t('files.pickFileHint')}</p>
        </div>
      );
    }
    if (fileLoading) return <Loading label={t('files.opening')} />;
    if (fileError && isPlan(openFile.path)) {
      return (
        <div className="files-noplan">
          <p className="files-noplan__title">{t('plan.none')}</p>
          <p className="files-noplan__hint">{t('plan.noneHint')}</p>
        </div>
      );
    }
    if (fileError) return <ErrorBanner message={fileError} />;
    return (
      <FileViewer
        name={openFile.name}
        content={fileContent}
        imageUrl={imageUrl}
        onNavigate={docLinks ? followLink : undefined}
        canBack={docLinks && histIdx > 0}
        canForward={docLinks && histIdx < hist.length - 1}
        onHistBack={() => histGo(-1)}
        onHistForward={() => histGo(1)}
        pinned={pins.map(norm).includes(norm(openFile.path))}
        onTogglePin={() => togglePin(openFile.path)}
      />
    );
  }

  // The left-pane tree (or fuzzy results when searching). Pins ride above it.
  function renderBrowserBody() {
    if (searchResults) {
      if (indexing) return <Loading label={t('files.searchLoading')} />;
      if (searchResults.length === 0) {
        return <p className="files-ide__noresults">{t('files.searchNoResults', { q: query.trim() })}</p>;
      }
      const shown = searchResults.slice(0, SEARCH_LIMIT);
      const extra = searchResults.length - shown.length;
      return (
        <div className="files-ide__results" role="list">
          <p className="files-ide__rescount">{t('files.searchResults', { n: searchResults.length })}</p>
          {shown.map(({ path }) => {
            const name = path.split('/').pop();
            const dir = path.slice(0, path.length - name.length).replace(/\/$/, '');
            return (
              <button
                key={path}
                type="button"
                className={`files-ide__result${norm(openFile?.path) === norm(path) ? ' files-ide__result--active' : ''}`}
                role="listitem"
                onClick={() => openFileAt(path)}
                title={path}
              >
                <span aria-hidden="true">📄</span>
                <span className="files-ide__result-name">{name}</span>
                {dir && <span className="files-ide__result-dir">{dir}</span>}
              </button>
            );
          })}
          {extra > 0 && <p className="files-ide__more">{t('files.searchMore', { n: extra })}</p>}
        </div>
      );
    }
    if (!root || root.state === 'loading') return <Loading label={t('files.loadingList')} />;
    if (root.state === 'error') return <ErrorBanner message={t('files.loadError')} onRetry={() => loadDir('/')} />;
    return (
      <FileTree
        nodes={nodes}
        expanded={expanded}
        onToggleDir={toggleDir}
        onOpenFile={openFileAt}
        onReferenceFile={referenceFile}
        onRetryDir={loadDir}
        hideGenerated={hideGenerated}
        hideCsproj={hideCsproj}
      />
    );
  }

  // No repo to browse (e.g. the dock before any agent is active).
  if (!repoId) {
    return (
      <div className="files-page">
        <div className="files-empty">
          <div className="files-empty__emoji" aria-hidden="true">{'\u{1F4C2}'}</div>
          <p className="files-empty__title">{t('files.noRepo')}</p>
        </div>
      </div>
    );
  }

  // IDE mode: one split layout — tree + fuzzy search on the left (collapsible),
  // the open file on the right — used identically on the tab and in the dock.
  if (ide) {
    return (
      <div className={`files-ide${browserOpen ? '' : ' files-ide--collapsed'}`}>
        <div className="files-ide__rail">
          <button
            type="button"
            className="files-ide__toggle"
            onClick={toggleBrowser}
            title={browserOpen ? t('files.hideBrowser') : t('files.showBrowser')}
            aria-label={browserOpen ? t('files.hideBrowser') : t('files.showBrowser')}
            aria-pressed={browserOpen}
          >
            {browserOpen ? '«' : '»'}
          </button>
        </div>
        {browserOpen && (
          <div
            className="files-ide__browser"
            ref={browserRef}
            style={{
              ...(browserWidth != null ? { flexBasis: `${browserWidth}px` } : null),
              '--tree-zoom': treeZoom,
            }}
          >
            <div className="files-ide__search">
              <span className="files-ide__search-icon" aria-hidden="true">🔎</span>
              <input
                type="text"
                className="files-ide__search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('files.search')}
                aria-label={t('files.search')}
              />
              {query && (
                <button
                  type="button"
                  className="files-ide__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {pins.length > 0 && !searchResults && (
              <div className="files-pins" role="list" aria-label={t('files.pinned')}>
                <span className="files-pins__label">{t('files.pinned')}</span>
                {pins.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="files-pin"
                    role="listitem"
                    onClick={() => openFileAt(p)}
                  >
                    <span aria-hidden="true">📌</span> {p.split('/').pop()}
                  </button>
                ))}
              </div>
            )}
            <div className="files-ide__scroll">{renderBrowserBody()}</div>
            <div className="files-ide__bottombar">
            <button
              type="button"
              className={`files-ide__filter${hideGenerated ? ' files-ide__filter--on' : ''}`}
              onClick={toggleHideGenerated}
              title={t('files.hideGeneratedTitle')}
              aria-label={t('files.hideGeneratedTitle')}
              aria-pressed={hideGenerated}
            >
              <span aria-hidden="true">{hideGenerated ? '\u{1F6AB}' : '\u{1F441}️'}</span> bin/obj
            </button>
            <button
              type="button"
              className={`files-ide__filter${hideCsproj ? ' files-ide__filter--on' : ''}`}
              onClick={toggleHideCsproj}
              title={t('files.hideCsprojTitle')}
              aria-label={t('files.hideCsprojTitle')}
              aria-pressed={hideCsproj}
            >
              <span aria-hidden="true">{hideCsproj ? '\u{1F6AB}' : '\u{1F441}️'}</span> .csproj
            </button>
            <div className="files-ide__zoom" role="group" aria-label={t('files.zoom')}>
              <button
                type="button"
                className="files-ide__zoom-btn"
                onClick={() => zoomBy(-ZOOM_STEP)}
                disabled={treeZoom <= ZOOM_MIN}
                title={t('files.zoomOut')}
                aria-label={t('files.zoomOut')}
              >
                A−
              </button>
              <button
                type="button"
                className="files-ide__zoom-val"
                onClick={zoomReset}
                title={t('files.zoomReset')}
                aria-label={t('files.zoomReset')}
              >
                {Math.round(treeZoom * 100)}%
              </button>
              <button
                type="button"
                className="files-ide__zoom-btn"
                onClick={() => zoomBy(ZOOM_STEP)}
                disabled={treeZoom >= ZOOM_MAX}
                title={t('files.zoomIn')}
                aria-label={t('files.zoomIn')}
              >
                A+
              </button>
            </div>
            </div>
          </div>
        )}
        {browserOpen && (
          <div
            className="files-ide__resizer"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onResizeDown}
            title={t('files.resize')}
            aria-label={t('files.resize')}
          />
        )}
        <div className="files-ide__view">{renderViewerPane()}</div>
        {toast && <div className="files-toast" role="status">{toast}</div>}
      </div>
    );
  }

  if (openFile) {
    if (fileLoading) {
      return <Loading label={t('files.opening')} />;
    }
    // plan.md is special: when it's missing, show the friendly "no active plan"
    // state (carried over from the Plan tab) instead of a generic read error.
    if (fileError && isPlan(openFile.path)) {
      return (
        <div className="file-viewer">
          <div className="file-viewer__bar">
            <button type="button" className="file-viewer__back" onClick={showTree}>
              <span aria-hidden="true">&larr;</span> {t('common.back')}
            </button>
            <span className="file-viewer__name">{openFile.name}</span>
          </div>
          <div className="files-noplan">
            <p className="files-noplan__title">{t('plan.none')}</p>
            <p className="files-noplan__hint">{t('plan.noneHint')}</p>
          </div>
        </div>
      );
    }
    if (fileError) {
      return (
        <div className="file-viewer">
          <div className="file-viewer__bar">
            <button type="button" className="file-viewer__back" onClick={showTree}>
              <span aria-hidden="true">&larr;</span> {t('common.back')}
            </button>
            <span className="file-viewer__name" title={openFile.name}>
              {openFile.name}
            </span>
          </div>
          <ErrorBanner message={fileError} />
        </div>
      );
    }
    return (
      <FileViewer
        name={openFile.name}
        content={fileContent}
        imageUrl={imageUrl}
        onBack={showTree}
        onNavigate={docLinks ? followLink : undefined}
        canBack={docLinks && histIdx > 0}
        canForward={docLinks && histIdx < hist.length - 1}
        onHistBack={() => histGo(-1)}
        onHistForward={() => histGo(1)}
        pinned={pins.map(norm).includes(norm(openFile.path))}
        onTogglePin={() => togglePin(openFile.path)}
      />
    );
  }

  return (
    <div className="files-page">
      {pins.length > 0 && (
        <div className="files-pins" role="list" aria-label={t('files.pinned')}>
          <span className="files-pins__label">{t('files.pinned')}</span>
          {pins.map((p) => (
            <button
              key={p}
              type="button"
              className="files-pin"
              role="listitem"
              onClick={() => openFileAt(p)}
            >
              <span aria-hidden="true">📌</span> {p.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {!root || root.state === 'loading' ? (
        <Loading label={t('files.loadingList')} />
      ) : root.state === 'error' ? (
        <ErrorBanner message={t('files.loadError')} onRetry={() => loadDir('/')} />
      ) : (
        <FileTree
          nodes={nodes}
          expanded={expanded}
          onToggleDir={toggleDir}
          onOpenFile={openFileAt}
          onReferenceFile={referenceFile}
          onRetryDir={loadDir}
          hideGenerated={hideGenerated}
          hideCsproj={hideCsproj}
        />
      )}

      {toast && <div className="files-toast" role="status">{toast}</div>}
    </div>
  );
}
