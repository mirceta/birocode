import { useState } from 'react';
import { useFeature } from '../../context/UiModeContext';
import { useFlags } from '../../context/FlagsContext';
import { useT } from '../../i18n/LanguageContext';

// Per-dock agent-flags badge (docs/loop-driven-agent-convention.md,
// "Non-blocking flags"): ⚑ n on the agent's own card whenever THIS repo has
// open flags, so a gripe is attributable at a glance instead of only via the
// repo name in the global footer. Tapping it opens the repo's flags inline with
// the same dismiss the footer has — one ledger, two views (state comes from the
// shared FlagsProvider). Renders nothing while this repo is flag-free.
export default function DockFlags({ repoId }) {
  const enabled = useFeature('flagsDockBadge');
  const flagsCtx = useFlags();
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const mine = (flagsCtx?.flags || []).filter((f) => f.repoId === repoId);
  if (!enabled || !flagsCtx || mine.length === 0) return null;

  return (
    <div className="phone__flags">
      <div className="phone__loop-row">
        <button
          type="button"
          className={`phone__loop-btn phone__flags-btn${open ? ' phone__loop-btn--on' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={t('flags.dockHint')}
        >
          ⚑ {mine.length} {t('flags.dockLabel')}
        </button>
      </div>
      {open && (
        <div className="phone__loop-pop phone__flags-pop">
          <ul className="phone__flags-list">
            {mine.map((f) => (
              <li key={f.id} className="phone__flags-item">
                <span className="phone__flags-text">{f.text}</span>
                <button
                  type="button"
                  className="phone__flags-dismiss"
                  onClick={() => flagsCtx.dismiss(f.id)}
                  aria-label={t('flags.dismiss')}
                  title={t('flags.dismiss')}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
