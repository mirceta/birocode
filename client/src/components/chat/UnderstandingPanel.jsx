import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import Markdown from '../shared/Markdown';
import { useRepo } from '../../context/RepoContext';
import { useT } from '../../i18n/LanguageContext';

// Understanding panel (plans/understanding-panel.md): a collapsible card pinned
// at the top of the chat window that renders the repo-root `understanding.md` —
// Claude's own restatement of what was asked — so the user can confirm "you
// understood me" before work proceeds.
//
// No backend of its own: it reads the file through the existing files endpoint
// (repo-scoped by X-Repo-Id), polling while visible so it updates live as
// Claude (re)writes the file within a turn — the Plan tab's pattern, scoped to
// the chat. No file → the panel renders nothing (no empty noise).
const PATH = 'understanding.md';
const POLL_MS = 5000;
const COLLAPSE_KEY = 'claudeweb_understanding_collapsed';

export default function UnderstandingPanel() {
  const { t } = useT();
  const { currentRepoId } = useRepo();

  const [content, setContent] = useState(null); // null = no file
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    try {
      const file = await apiGet(`/files/read?path=${encodeURIComponent(PATH)}`);
      const text = typeof file === 'string' ? file : (file?.content ?? null);
      setContent(text && text.trim() ? text : null);
    } catch {
      setContent(null);
    }
  }, []);

  // Reload on mount and whenever the selected project changes (the file is
  // repo-root, so a different project means a different understanding).
  useEffect(() => {
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

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  if (content == null) return null;

  return (
    <section className="understanding" aria-label={t('understanding.title')}>
      <button
        type="button"
        className="understanding__header"
        onClick={toggle}
        aria-expanded={!collapsed}
      >
        <span className="understanding__chevron" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="understanding__title">{t('understanding.title')}</span>
        <span className="understanding__hint">
          {collapsed ? t('understanding.expand') : t('understanding.collapse')}
        </span>
      </button>
      {!collapsed && (
        <div className="understanding__body">
          <Markdown>{content}</Markdown>
        </div>
      )}
    </section>
  );
}
