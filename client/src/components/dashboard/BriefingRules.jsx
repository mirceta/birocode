import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// The always-visible briefing rules editor beside the loop section (openspec:
// loop-agent-briefing, D5). GLOBAL: ONE rules list frames every agent's driven
// sends — it renders on each dock card for reachability, not per-agent scoping,
// and says so. Disabled rules are the parking lot: an idea is captured the moment
// it occurs and enabled when it's ready; only enabled rules compose into sends.
// Reads/writes /api/autopilot/briefing — session-authed, deliberately NOT
// operator-gated (D2b): capturing an idea must work whenever the dock is visible.
// The fixed frame (situation, NEEDS_HUMAN line, contract lines, verify note) is
// server-owned and not editable here; the preview shows the full composition.
const WORD_TARGET = 120; // D2a crafting constraint — soft hint, not a limit

export default function BriefingRules() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null); // { rev, rules, frame, workPreview }
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = () => apiGet('/autopilot/briefing').then((d) => { setData(d); setErr(false); }).catch(() => setErr(true));
  useEffect(() => { load(); }, []);

  const rules = data?.rules ?? [];
  const enabledCount = rules.filter((r) => r.enabled).length;

  // Every edit PUTs the FULL list (the server archives the outgoing revision) and
  // reconciles from the response, so concurrent edits from another card converge.
  const put = async (next) => {
    setBusy(true);
    setErr(false);
    try {
      setData(await apiPut('/autopilot/briefing', { rules: next }));
    } catch {
      setErr(true);
      load();
    } finally {
      setBusy(false);
    }
  };

  const addRule = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    put([...rules, { text, enabled: true }]);
  };
  const toggleRule = (id) => put(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  const deleteRule = (id) => put(rules.filter((r) => r.id !== id));
  const commitEdit = () => {
    const id = editId;
    const text = editText.trim();
    setEditId(null);
    if (!id) return;
    if (!text) return; // emptied text = abandoned edit, not a delete
    if (rules.find((r) => r.id === id)?.text === text) return;
    put(rules.map((r) => (r.id === id ? { ...r, text } : r)));
  };

  const words = (data?.workPreview || '').split(/\s+/).filter(Boolean).length;

  return (
    <div className="phone__brief">
      <div className="phone__loop-row">
        <button
          type="button"
          className={`phone__loop-btn phone__brief-btn${open ? ' phone__loop-btn--on' : ''}`}
          onClick={() => { setOpen((v) => !v); if (!open) load(); }}
          title={t('dashboard.briefingHint')}
        >
          📝 {t('dashboard.briefingTitle')} · {data ? `${enabledCount}/${rules.length}` : '…'}
        </button>
      </div>
      {open && (
        <div className="phone__loop-pop phone__brief-pop">
          <p className="phone__loop-sect-desc">{t('dashboard.briefingGlobal')}</p>
          {rules.length === 0 && (
            <div className="phone__loop-msg">{t('dashboard.briefingEmpty')}</div>
          )}
          <ul className="phone__brief-list">
            {rules.map((r) => (
              <li key={r.id} className={`phone__brief-rule${r.enabled ? '' : ' phone__brief-rule--off'}`}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={busy}
                  title={t(r.enabled ? 'dashboard.briefingDisable' : 'dashboard.briefingEnable')}
                  onChange={() => toggleRule(r.id)}
                />
                {editId === r.id ? (
                  <textarea
                    className="phone__brief-edit"
                    rows={2}
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
                      if (e.key === 'Escape') setEditId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="phone__brief-text"
                    title={t('dashboard.briefingEditHint')}
                    onClick={() => { setEditId(r.id); setEditText(r.text); }}
                  >
                    {r.text}
                  </button>
                )}
                <button
                  type="button"
                  className="phone__brief-del"
                  disabled={busy}
                  title={t('dashboard.briefingDelete')}
                  onClick={() => deleteRule(r.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="phone__brief-addrow">
            <input
              type="text"
              className="phone__brief-add"
              value={draft}
              placeholder={t('dashboard.briefingAddPlaceholder')}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRule(); }}
            />
            <button type="button" className="phone__loop-use" disabled={busy || !draft.trim()} onClick={addRule}>
              {t('dashboard.briefingAdd')}
            </button>
          </div>
          <button
            type="button"
            className="phone__loop-inspect-toggle"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? t('dashboard.briefingPreviewHide') : t('dashboard.briefingPreviewShow')}
          </button>
          {preview && data && (
            <div className="phone__loop-inspect">
              <div className="phone__loop-inspect-k">
                {t('dashboard.briefingPreviewWork')}
                {words > WORD_TARGET && (
                  <span className="phone__brief-long">{t('dashboard.briefingTooLong', { n: words })}</span>
                )}
              </div>
              <pre className="phone__loop-inspect-pre">{data.workPreview}</pre>
              <div className="phone__loop-inspect-k">{t('dashboard.briefingPreviewVerify')}</div>
              <pre className="phone__loop-inspect-pre">{data.frame?.verifyNote}</pre>
            </div>
          )}
          {err && (
            <div className="phone__loop-msg phone__loop-msg--err" role="status">
              {t('dashboard.briefingError')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
