import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import Markdown from '../components/shared/Markdown';
import resolvePath from '../components/shared/resolvePath';
import { useRepo } from '../context/RepoContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './plan.css';

// Plan tab (plans/plan-tab.md): renders the repo-root plan.md — the ephemeral
// working plan of the feature in flight. No file → "no active plan" empty
// state. Polls while visible so the plan updates live as Claude edits it.
//
// Subplan navigation (plan.md "clickable subplan navigation"): internal
// markdown links re-target the tab to that file via setCurrentPath; a sticky
// home button always returns to ROOT.
const POLL_MS = 5000;
const ROOT = 'plan.md';

export default function Plan() {
  const { t } = useT();
  const { currentRepoId } = useRepo();

  const [currentPath, setCurrentPath] = useState(ROOT);
  const [content, setContent] = useState(null); // null = no file at currentPath
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(false); // raw text view (plans/plan-raw-view.md)
  const canRaw = useFeature('planRawView');

  const load = useCallback(async () => {
    try {
      const file = await apiGet(`/files/read?path=${encodeURIComponent(currentPath)}`);
      setContent(typeof file === 'string' ? file : (file?.content ?? null));
    } catch {
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  // Repo switch resets navigation to the root plan, rendered.
  useEffect(() => {
    setCurrentPath(ROOT);
    setRaw(false);
  }, [currentRepoId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live updates: poll while the page is visible, refresh on return.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const atRoot = currentPath === ROOT;
  const goHome = () => { if (!atRoot) setCurrentPath(ROOT); };
  const handleLinkClick = (href) => setCurrentPath(resolvePath(currentPath, href));

  const header = (
    <div className="plan__header">
      <button
        type="button"
        className="plan__home"
        onClick={goHome}
        disabled={atRoot}
        aria-label={t('plan.homeAria')}
      >
        <span aria-hidden="true">⌂</span> {t('plan.home')}
      </button>
      {canRaw && (
        <button
          type="button"
          className="plan__raw-toggle"
          onClick={() => setRaw((r) => !r)}
          aria-pressed={raw}
          aria-label={t('plan.rawAria')}
        >
          <span aria-hidden="true">{'</>'}</span> {t('plan.raw')}
        </button>
      )}
      {!atRoot && <span className="plan__path">{currentPath}</span>}
    </div>
  );

  if (loading) return <div className="plan">{header}<Loading /></div>;

  if (content == null) {
    return (
      <div className="plan">
        {header}
        <div className="plan__empty">
          <p className="plan__empty-title">{t('plan.none')}</p>
          <p className="plan__empty-hint">{t('plan.noneHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="plan">
      {header}
      {raw
        ? <pre className="plan__raw">{content}</pre>
        : <Markdown onLinkClick={handleLinkClick}>{content}</Markdown>}
    </div>
  );
}
