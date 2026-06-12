import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import FileTree from '../components/files/FileList';
import FileViewer from '../components/files/FileViewer';
import resolvePath from '../components/shared/resolvePath';
import { useChat } from '../context/ChatContext';
import { useRepo } from '../context/RepoContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import '../components/files/files.css';

// VS Code-style explorer (see plans/files-tree-view.md): one flat node cache
// keyed by full path plus a Set of expanded folders. Children are fetched
// lazily on first expand and stay cached until the repo changes or the page
// unmounts.
export default function Files() {
  const { t } = useT();
  const { draft, setDraft } = useChat();
  const { currentRepoId } = useRepo();
  const [nodes, setNodes] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

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

  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  // Doc-link navigation (plans/doc-viewer.md slice 2): a history of file
  // paths visited via in-document links. Tree clicks reset it; ◀ ▶ move
  // through it without truncating, a new link click truncates the forward
  // tail (browser semantics).
  const docLinks = useFeature('docLinks');
  const [hist, setHist] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  const loadDir = useCallback(async (dirPath) => {
    setNodes((prev) => ({ ...prev, [dirPath]: { entries: null, state: 'loading' } }));
    try {
      const data = await apiGet(`/files?path=${encodeURIComponent(dirPath)}`);
      setNodes((prev) => ({
        ...prev,
        [dirPath]: { entries: Array.isArray(data) ? data : [], state: 'loaded' },
      }));
    } catch {
      setNodes((prev) => ({ ...prev, [dirPath]: { entries: null, state: 'error' } }));
    }
  }, []);

  // Switching projects (and first mount): reset the tree and close any open
  // file so we never show stale paths from another repository.
  useEffect(() => {
    setOpenFile(null);
    setFileError('');
    setNodes({});
    setExpanded(new Set());
    loadDir('/');
  }, [currentRepoId, loadDir]);

  // Tap a folder row: collapse if expanded, otherwise expand and lazily fetch
  // its children (also refetches after a failed attempt). Collapsed folders
  // keep their cached children, so re-expanding is instant.
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

  async function loadFile(filePath) {
    const name = filePath.split('/').pop();
    setOpenFile({ name, path: filePath });
    setFileContent('');
    setFileError('');
    setFileLoading(true);
    try {
      const data = await apiGet(`/files/read?path=${encodeURIComponent(filePath)}`);
      setFileContent(typeof data === 'string' ? data : data.content || '');
    } catch {
      setFileError(t('files.previewError'));
    } finally {
      setFileLoading(false);
    }
  }

  // Tree click: open the file and start a fresh history at it.
  function openFileAt(filePath) {
    setHist([filePath]);
    setHistIdx(0);
    loadFile(filePath);
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

  function closeFile() {
    setOpenFile(null);
    setFileError('');
    setFileContent('');
    setHist([]);
    setHistIdx(-1);
  }

  if (openFile) {
    if (fileLoading) {
      return <Loading label={t('files.opening')} />;
    }
    if (fileError) {
      return (
        <div className="file-viewer">
          <div className="file-viewer__bar">
            <button type="button" className="file-viewer__back" onClick={closeFile}>
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
        onBack={closeFile}
        onNavigate={docLinks ? followLink : undefined}
        canBack={docLinks && histIdx > 0}
        canForward={docLinks && histIdx < hist.length - 1}
        onHistBack={() => histGo(-1)}
        onHistForward={() => histGo(1)}
      />
    );
  }

  const root = nodes['/'];

  return (
    <div className="files-page">
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
        />
      )}

      {toast && <div className="files-toast" role="status">{toast}</div>}
    </div>
  );
}
