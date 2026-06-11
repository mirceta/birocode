import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import Markdown from '../components/shared/Markdown';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './plan.css';

// Plan tab (plans/plan-tab.md): renders the repo-root plan.md — the ephemeral
// working plan of the feature in flight. No file → "no active plan" empty
// state. Polls while visible so the plan updates live as Claude edits it.
const POLL_MS = 5000;

export default function Plan() {
  const { t } = useT();
  const { currentRepoId } = useRepo();

  const [content, setContent] = useState(null); // null = no plan.md
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const file = await apiGet('/files/read?path=plan.md');
      setContent(typeof file === 'string' ? file : (file?.content ?? null));
    } catch {
      // 404 (no plan.md) and transient errors both fall back to the empty
      // state — the plan is a glanceable aid, not a place for error chrome.
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, currentRepoId]);

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

  if (loading) return <Loading />;

  if (content == null) {
    return (
      <div className="plan plan--empty">
        <p className="plan__empty-title">{t('plan.none')}</p>
        <p className="plan__empty-hint">{t('plan.noneHint')}</p>
      </div>
    );
  }

  return (
    <div className="plan">
      <Markdown>{content}</Markdown>
    </div>
  );
}
