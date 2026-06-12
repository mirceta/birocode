import { useLocation, useNavigate } from 'react-router-dom';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';

// Chat and Term share ONE nav slot (plans/terminal-sessions.md): this
// segmented control in both page headers is the only way to flip between
// them — deliberately not a tap-the-nav-icon-again trick. The choice is
// remembered per device so the nav slot reopens the last-used view.
export const CLAUDE_VIEW_KEY = 'claudeweb_claude_view';

export function getLastClaudeView() {
  try {
    return localStorage.getItem(CLAUDE_VIEW_KEY) === 'term' ? 'term' : 'chat';
  } catch {
    return 'chat';
  }
}

export default function ClaudeViewToggle() {
  const { t } = useT();
  const showTerm = useFeature('terminalTab');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!showTerm) return null; // Basic mode: plain Chat, no toggle.

  const view = pathname.replace(/\/+$/, '') === '/studio/terminal' ? 'term' : 'chat';
  const go = (next) => {
    if (next === view) return;
    try {
      localStorage.setItem(CLAUDE_VIEW_KEY, next);
    } catch {
      /* private mode */
    }
    navigate(next === 'term' ? '/studio/terminal' : '/studio');
  };

  return (
    <div className="view-toggle" role="tablist" aria-label={t('claudeView.aria')}>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'chat'}
        className={`view-toggle__btn${view === 'chat' ? ' is-active' : ''}`}
        onClick={() => go('chat')}
      >
        {t('claudeView.chat')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'term'}
        className={`view-toggle__btn${view === 'term' ? ' is-active' : ''}`}
        onClick={() => go('term')}
      >
        {t('claudeView.term')}
      </button>
    </div>
  );
}
