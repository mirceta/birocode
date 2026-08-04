import { useT } from '../../i18n/LanguageContext';
import { SM_REFS, SECTION_NAME_KEY } from './loopMachines';

// Presentational pieces of the state-sectioned parameter panel (openspec:
// loop-state-param-panel). DockLoopControl composes these per kind; nothing
// here fetches or decides — the structural markup renders identically with the
// gate open or closed, only ParamBox degrades to the gate hint.

// One section card: LOOP-WIDE or a state, named in machine vocabulary, with
// its one-line dynamics description and the live `now` marker (design D3).
export function StateSection({ id, descKey, now, dim, children }) {
  const { t } = useT();
  return (
    <div className={`phone__loop-smsect phone__loop-smsect--${id}`
      + `${now ? ' phone__loop-smsect--now' : ''}${dim ? ' phone__loop-smsect--dim' : ''}`}
    >
      <div className="phone__loop-smsect-h">
        <span className={`phone__loop-smsect-name phone__loop-smsect-name--${id}`}>
          {t(SECTION_NAME_KEY[id])}
        </span>
        {descKey && <span className="phone__loop-smsect-desc">{t(descKey)}</span>}
        {now && <span className="phone__loop-smsect-now">● {t('dashboard.loopSm.now')}</span>}
      </div>
      <div className="phone__loop-smsect-b">{children}</div>
    </div>
  );
}

// The expected sentinel as a first-class control (design D4): either the badge
// the agent must emit in this state, or — for the badge-less queue work state —
// the stated exit trigger, so "no badge here" is explicit, never an omission.
export function BadgeBox({ badge, exitKey }) {
  const { t } = useT();
  return (
    <div className="phone__loop-smbadge">
      <span className="phone__loop-smbadge-k">
        {t(badge ? 'dashboard.loopSm.badgeLabel' : 'dashboard.loopSm.exitLabel')}
      </span>
      {badge
        ? <span className="phone__loop-smbadge-token">{badge}</span>
        : <span className="phone__loop-smbadge-exit">{t(exitKey)}</span>}
    </div>
  );
}

// One dynamics line: condition text, then the color-coded state/terminal it
// leads to (resolved through SM_REFS so the wording always matches the section
// headers), then an optional consequence tail.
export function TransitionLine({ preKey, to, postKey }) {
  const { t } = useT();
  const ref = SM_REFS[to];
  return (
    <div className="phone__loop-smtrans">
      {t(preKey)}{' '}
      <span className={`phone__loop-smtrans-ref phone__loop-smtrans-ref--${ref.cls}`}>{t(ref.key)}</span>
      {postKey ? ` ${t(postKey)}` : ''}
    </div>
  );
}

// A labeled read-only parameter box (prompt templates, stored goal, last step).
// Gate closed replaces only the TEXT with the gate hint — the label stays, so
// the parameter's existence is never hidden (design D5).
export function ParamBox({ labelKey, text, gated }) {
  const { t } = useT();
  return (
    <>
      <div className="phone__loop-inspect-k">{t(labelKey)}</div>
      {gated
        ? <div className="phone__loop-msg phone__loop-msg--gate">{t('dashboard.loopGateClosed')}</div>
        : <pre className="phone__loop-inspect-pre phone__loop-smpre">{text || '—'}</pre>}
    </>
  );
}
