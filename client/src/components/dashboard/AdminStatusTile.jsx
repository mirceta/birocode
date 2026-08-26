import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './adminStatusTile.css';

// Always-admin status tile (openspec add-always-admin-status): reports whether
// UAC is disabled at the master switch on the HOST box, and lets the Operator
// enable it. The browser can't read HKLM or the process token, so the whole
// state comes from GET /api/always-admin/status on its own 5 s poller — same
// self-contained-chip idiom as HostClock, unmounted (and polling stopped) while
// the header strip is collapsed.
//
// state ∈ { active, reboot_pending, disabled } (+ supported:false => unsupported).
// Enable is offered only in `disabled`; a successful write lands in
// reboot_pending (the token won't flip until a reboot). The caveat + rollback
// note are always visible in the expanded body.
const POLL_MS = 5000;
const COLLAPSE_KEY = 'claudeweb_admin_status_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

// Maps state -> { dot modifier, i18n label key }. Unsupported is handled before
// this is consulted.
const STATE_UI = {
  active: { dot: 'ok', labelKey: 'adminStatus.state.active' },
  reboot_pending: { dot: 'pending', labelKey: 'adminStatus.state.rebootPending' },
  disabled: { dot: 'off', labelKey: 'adminStatus.state.disabled' },
};

export default function AdminStatusTile() {
  const { t } = useT();
  const [status, setStatus] = useState(null); // last good status payload; null until first load
  const [loadError, setLoadError] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState(null); // error string from a failed enable
  const aliveRef = useRef(true);

  const load = async () => {
    try {
      const d = await apiGet('/always-admin/status');
      if (!aliveRef.current) return;
      setStatus(d);
      setLoadError(false);
    } catch {
      if (aliveRef.current) setLoadError(true);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    load();
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const poll = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  async function onEnable() {
    setEnabling(true);
    setEnableError(null);
    try {
      const res = await apiPost('/always-admin/enable');
      if (!aliveRef.current) return;
      if (res && res.ok) {
        await load(); // re-poll: should now read reboot_pending
      } else {
        setEnableError(res?.error || t('adminStatus.enable.failed'));
      }
    } catch (e) {
      if (aliveRef.current) setEnableError(e?.message || t('adminStatus.enable.failed'));
    } finally {
      if (aliveRef.current) setEnabling(false);
    }
  }

  const supported = status ? status.supported : true;
  const state = status?.state || 'disabled';
  const loading = !status && !loadError;

  let dotMod;
  let label;
  if (loading) {
    dotMod = 'loading';
    label = t('adminStatus.checking');
  } else if (!supported) {
    dotMod = 'off';
    label = t('adminStatus.state.unsupported');
  } else {
    const ui = STATE_UI[state] || STATE_UI.disabled;
    dotMod = ui.dot;
    label = t(ui.labelKey);
  }

  const showEnable = supported && !loading && state === 'disabled';

  return (
    <div className={`astile${collapsed ? ' astile--collapsed' : ''}`}>
      <button
        type="button"
        className="astile__hd"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={t('adminStatus.title')}
      >
        <span className="astile__kind">{t('adminStatus.kind')}</span>
        <span className={`astile__dot astile__dot--${dotMod}`} aria-hidden="true" />
        <span className="astile__label">{label}</span>
        <span className="astile__chevron" aria-hidden="true">⌄</span>
      </button>

      {!collapsed && (
        <div className="astile__body">
          {showEnable && (
            <button
              type="button"
              className="astile__enable"
              onClick={onEnable}
              disabled={enabling}
            >
              {enabling ? t('adminStatus.enable.working') : t('adminStatus.enable.action')}
            </button>
          )}
          {enableError && <div className="astile__error">{enableError}</div>}
          <div className="astile__note">{t('adminStatus.caveat')}</div>
          <div className="astile__note astile__note--soft">{t('adminStatus.rollback')}</div>
        </div>
      )}
    </div>
  );
}
