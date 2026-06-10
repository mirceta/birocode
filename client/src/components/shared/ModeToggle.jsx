import { useState } from 'react';
import { useUiMode } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';

// Quiet gear button in the header opening a small popover with the
// Simple / Advanced mode switch (see plans/ui-modes.md). Deliberately
// understated so the End User has no reason to touch it.
export default function ModeToggle() {
  const { uiMode, setUiMode } = useUiMode();
  const { t } = useT();
  const [open, setOpen] = useState(false);

  function pick(mode) {
    setUiMode(mode);
    setOpen(false);
  }

  return (
    <div className="mode-toggle">
      <button
        type="button"
        className="mode-toggle__button"
        onClick={() => setOpen(!open)}
        aria-label={t('mode.label')}
        title={t('mode.label')}
      >
        ⚙
      </button>
      {open && (
        <>
          <div className="mode-toggle__backdrop" onClick={() => setOpen(false)} />
          <div className="mode-toggle__popover" role="menu">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={uiMode === 'basic'}
              className={`mode-toggle__option${uiMode === 'basic' ? ' is-active' : ''}`}
              onClick={() => pick('basic')}
            >
              {t('mode.simple')}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={uiMode === 'advanced'}
              className={`mode-toggle__option${uiMode === 'advanced' ? ' is-active' : ''}`}
              onClick={() => pick('advanced')}
            >
              {t('mode.advanced')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
