// The "📺 big screen" header pill (openspec sofa-mode, design D2): switches THIS tab into the
// listening big screen (remembered per browser), shows its health, and mints a pairing PIN the
// phone types at /remote. Advanced only (capability bigScreen). The listener itself is useBigScreen.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDock } from '../../context/DockContext';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import { useBigScreen } from './useBigScreen.js';
import './bigscreen.css';

export default function BigScreenPill() {
  const enabled = useFeature('bigScreen');
  const { t } = useT();
  const navigate = useNavigate();
  const { tabs, activeTabId } = useDock();
  const active = (tabs || []).find((x) => x.id === activeTabId) || null;
  const view = typeof window !== 'undefined' ? window.location.pathname.replace(/^.*\/studio\/?/, '') || 'chat' : null;
  const screen = useBigScreen({ activeAgent: active?.repoName || null, activeRepoId: active?.repoId || null, view, navigate });
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(screen.name || 'projector');
  const [pin, setPin] = useState(null); // { pin, expiresAt }
  const [left, setLeft] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!pin) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((pin.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pin]);
  // Auto-close when the PIN has really expired (left starts at 0 before the first tick — compare the clock, not the counter).
  useEffect(() => { if (pin && left === 0 && Date.now() >= pin.expiresAt) setPin(null); }, [pin, left]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!enabled) return null;

  const pair = async () => {
    try { const r = await screen.pairNew(); setLeft(Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000))); setPin({ pin: r.pin, expiresAt: r.expiresAt }); } catch { setPin(null); }
  };

  return (
    <div className="bigscreen" ref={menuRef}>
      <button
        type="button"
        className={`bigscreen__pill${screen.on ? ' is-on' : ''}${screen.health === 'warn' ? ' is-warn' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={screen.on ? t('bigscreen.onTitle').replace('{name}', screen.name) : t('bigscreen.offTitle')}
        aria-expanded={open}
      >
        📺 {screen.on ? t('bigscreen.listening') : t('bigscreen.label')}
      </button>
      {open && (
        <div className="bigscreen__menu" role="menu">
          <label className="bigscreen__row">
            <input type="checkbox" checked={screen.on} onChange={(e) => screen.setOn(e.target.checked, nameDraft)} />
            <span>{t('bigscreen.toggle')}</span>
          </label>
          <label className="bigscreen__row bigscreen__row--name">
            <span>{t('bigscreen.name')}</span>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => screen.on && screen.setOn(true, nameDraft)} />
          </label>
          <p className="bigscreen__hint">{t('bigscreen.hint')}</p>
          <button type="button" className="bigscreen__pair" onClick={pair}>{t('bigscreen.pair')}</button>
          {screen.lastOutcome && <p className="bigscreen__outcome">{screen.lastOutcome}</p>}
        </div>
      )}
      {pin && (
        <div className="bigscreen__pinveil" onClick={() => setPin(null)} role="dialog" aria-label={t('bigscreen.pinTitle')}>
          <div className="bigscreen__pinbox" onClick={(e) => e.stopPropagation()}>
            <div className="bigscreen__pintitle">{t('bigscreen.pinTitle')}</div>
            <div className="bigscreen__pin">{pin.pin.slice(0, 3)} {pin.pin.slice(3)}</div>
            <div className="bigscreen__pinhow">{t('bigscreen.pinHow').replace('{url}', `${window.location.origin}/remote`)}</div>
            <div className="bigscreen__pinleft">{t('bigscreen.pinLeft').replace('{s}', String(left))}</div>
            <button type="button" className="bigscreen__pair" onClick={() => setPin(null)}>{t('bigscreen.pinClose')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
