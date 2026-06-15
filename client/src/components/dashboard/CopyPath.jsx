import { useState } from 'react';
import { copyText } from '../../lib/copyText';
import { useT } from '../../i18n/LanguageContext';

// A click-to-copy filesystem path for the agent dashboard (cards + phone docks).
// It lives INSIDE the card/dock's open-agent <button>, so: (a) it's a
// role="button" span, not a nested <button> (which is invalid HTML), and (b) the
// click is stopped from bubbling so it copies instead of opening the agent.
// `className` selects the per-surface container styling (dash-cell__path /
// phone__path). See plans/dock-copy-path.md.
export default function CopyPath({ path, className = '' }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  async function doCopy(e) {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyText(path);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') doCopy(e);
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={`copy-path${copied ? ' copy-path--copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={doCopy}
      onKeyDown={onKeyDown}
      title={t('dashboard.copyPath')}
      aria-label={`${t('dashboard.copyPath')}: ${path}`}
    >
      <span className="copy-path__text">{path}</span>
      <span className="copy-path__icon" aria-hidden="true">{copied ? '✓' : '📋'}</span>
      {copied && <span className="copy-path__toast">{t('dashboard.copied')}</span>}
    </span>
  );
}
