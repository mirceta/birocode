import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../api/client';
import { copyText } from '../../lib/copyText';
import { useT } from '../../i18n/LanguageContext';

// Shared-board sync bar (openspec ideas-drive-sync): the ideas list can
// replicate against any endpoint speaking the shared-store contract. This bar
// is the whole UI for it — paste the URL, flip sync on, watch the status chip.
// It collapses to just the chip once configured; clicking the chip re-opens
// the editor. Status is polled from /api/notes/sync/status while the panel is
// visible, and when a poll shows a new successful sync we call onSynced() so
// the parent reloads the notes list (remote edits land without a refresh).
//
// The form also carries the hub section (openspec ideas-harness-hub): flip
// "Host on this harness" and THIS harness serves the shared store at
// /api/notes/hub/<token> — the shown ready-to-paste URL is assembled from
// window.location.origin, because whatever origin the operator is browsing
// through is by construction reachable from outside.
const STATUS_POLL_MS = 5000;

const STATE_LABEL_KEY = {
  disabled: 'ideas.syncOff',
  synced: 'ideas.syncSynced',
  syncing: 'ideas.syncSyncing',
  offline: 'ideas.syncOffline',
  error: 'ideas.syncErrorState',
};

export default function IdeasSyncBar({ onSynced }) {
  const { t } = useT();
  const [config, setConfig] = useState(null); // null until loaded
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [enabledDraft, setEnabledDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hub, setHub] = useState(null); // null until loaded
  const [hubSaving, setHubSaving] = useState(false);
  const [hubCopied, setHubCopied] = useState(false);
  const lastSyncRef = useRef(null);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    let gone = false;
    apiGet('/notes/sync/config')
      .then((cfg) => {
        if (gone) return;
        setConfig(cfg);
        setUrlDraft(cfg.syncUrl || '');
        setEnabledDraft(!!cfg.enabled);
      })
      .catch(() => {
        /* bar stays hidden until the config loads */
      });
    return () => {
      gone = true;
    };
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await apiGet('/notes/sync/status');
      setStatus(s);
      // A fresh successful sync may have merged remote edits into the local
      // list — tell the parent to re-fetch. Skip the first observation so
      // mounting doesn't trigger a redundant reload.
      if (s.lastSyncAt && lastSyncRef.current !== null && s.lastSyncAt !== lastSyncRef.current) {
        onSyncedRef.current?.();
      }
      if (s.lastSyncAt) lastSyncRef.current = s.lastSyncAt;
      else if (lastSyncRef.current === null) lastSyncRef.current = 0;
    } catch {
      /* transient — next tick retries */
    }
  }, []);

  // Hub state loads when the form opens (it lives only inside the form).
  useEffect(() => {
    if (!open || hub !== null) return;
    let gone = false;
    apiGet('/notes/hub-info')
      .then((h) => {
        if (!gone) setHub(h);
      })
      .catch(() => {
        /* section stays hidden until it loads */
      });
    return () => {
      gone = true;
    };
  }, [open, hub]);

  async function toggleHub(enabled) {
    if (hubSaving) return;
    setHubSaving(true);
    try {
      setHub(await apiPost('/notes/hub-info', { enabled }));
    } catch {
      /* leave state as-is; next open retries */
    } finally {
      setHubSaving(false);
    }
  }

  useEffect(() => {
    if (!config?.enabled) return undefined;
    pollStatus();
    const id = setInterval(pollStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [config?.enabled, pollStatus]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const cfg = await apiPut('/notes/sync/config', {
        enabled: enabledDraft,
        syncUrl: urlDraft.trim(),
        pollSeconds: config?.pollSeconds || 30,
      });
      setConfig(cfg);
      setOpen(false);
      lastSyncRef.current = null;
      if (cfg.enabled) pollStatus();
      else setStatus(null);
    } catch (e) {
      setSaveError(e?.message || t('ideas.syncSaveError'));
    } finally {
      setSaving(false);
    }
  }

  if (config === null) return null;

  const configured = !!config.syncUrl;
  const state = config.enabled ? status?.state || 'syncing' : 'disabled';

  const chip = (
    <button
      type="button"
      className={`ideas-sync__chip ideas-sync__chip--${state}${configured ? '' : ' ideas-sync__chip--setup'}`}
      data-state={state}
      title={status?.lastError || t('ideas.syncChipTitle')}
      aria-expanded={open}
      onClick={() => {
        setOpen((o) => !o);
        setUrlDraft(config.syncUrl || '');
        setEnabledDraft(!!config.enabled);
        setSaveError('');
      }}
    >
      <span className="ideas-sync__dot" aria-hidden="true" />
      {configured ? t(STATE_LABEL_KEY[state] || 'ideas.syncOff') : t('ideas.syncSetup')}
    </button>
  );

  return (
    <div className="ideas-sync">
      <div className="ideas-sync__row">{chip}</div>
      {open && (
        <div className="ideas-sync__form">
          <input
            className="ideas__input ideas-sync__url"
            type="url"
            placeholder={t('ideas.syncUrlPlaceholder')}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="ideas-sync__form-row">
            <label className="ideas-sync__enable">
              <input
                type="checkbox"
                checked={enabledDraft}
                disabled={!urlDraft.trim()}
                onChange={(e) => setEnabledDraft(e.target.checked)}
              />
              {t('ideas.syncEnable')}
            </label>
            <button
              type="button"
              className="idea__btn idea__btn--primary"
              onClick={save}
              disabled={saving || (enabledDraft && !urlDraft.trim())}
            >
              {saving ? t('ideas.syncSaving') : t('ideas.save')}
            </button>
            <button type="button" className="idea__btn" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="ideas-sync__hint">{t('ideas.syncHint')}</p>
          {hub !== null && (
            <div className="ideas-sync__hub">
              <label className="ideas-sync__enable">
                <input
                  type="checkbox"
                  checked={!!hub.enabled}
                  disabled={hubSaving}
                  onChange={(e) => toggleHub(e.target.checked)}
                />
                {t('ideas.hubEnable')}
              </label>
              {hub.enabled && hub.token && (
                <div className="ideas-sync__hub-url-row">
                  <input
                    className="ideas__input ideas-sync__url"
                    readOnly
                    value={`${window.location.origin}/api/notes/hub/${hub.token}`}
                    onFocus={(e) => e.target.select()}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="idea__btn"
                    onClick={async () => {
                      const ok = await copyText(`${window.location.origin}/api/notes/hub/${hub.token}`);
                      if (ok) {
                        setHubCopied(true);
                        setTimeout(() => setHubCopied(false), 1500);
                      }
                    }}
                  >
                    {hubCopied ? t('ideas.hubCopied') : t('ideas.hubCopy')}
                  </button>
                </div>
              )}
              <p className="ideas-sync__hint">{t('ideas.hubHint')}</p>
            </div>
          )}
          {saveError && <p className="ideas-sync__error">{saveError}</p>}
          {config.enabled && status?.lastError && (
            <p className="ideas-sync__error">{status.lastError}</p>
          )}
        </div>
      )}
    </div>
  );
}
