import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { apiGet, apiPost, apiStreamGet } from '../api/client';
import { createSseParser } from '../components/chat/sseParser';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './terminal.css';

// Terminal tab (plans/terminal-tab.md): a backend-owned PowerShell on a
// ConPTY pseudo-console, rendered with xterm.js. The shell survives client
// disconnects; every (re)attach resets the xterm and replays the server's
// output buffer, so there is no seq watermark to get wrong. Input goes
// through POST /api/terminal/input as raw PTY bytes — the composer adds \r,
// the key row sends escape sequences, and desktop keystrokes pass through
// xterm's onData.
const SPECIAL_KEYS = [
  { label: 'Esc', data: '\x1b' },
  { label: 'Tab', data: '\t' },
  { label: '↑', data: '\x1b[A' },
  { label: '↓', data: '\x1b[B' },
  { label: 'Enter', data: '\r' },
  { label: 'Ctrl+C', data: '\x03' },
];

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export default function Terminal() {
  const { t } = useT();
  const { currentRepoId } = useRepo();

  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const abortRef = useRef(null);
  const [line, setLine] = useState('');
  const [exited, setExited] = useState(false);
  const [error, setError] = useState('');

  const sendData = useCallback(async (data) => {
    try {
      await apiPost('/terminal/input', { data });
      setError('');
    } catch {
      setError(t('terminal.sendError'));
    }
  }, [t]);

  // One attachment: reset the xterm, replay the whole buffer, stream live.
  const attach = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    termRef.current?.reset();
    const parse = createSseParser((evt) => {
      if (evt.type === 'data' && evt.data) termRef.current?.write(b64ToBytes(evt.data));
      if (evt.type === 'exit') setExited(true);
    });
    try {
      await apiStreamGet('/terminal/stream', parse, { signal: controller.signal });
    } catch (err) {
      if (err?.name !== 'AbortError') setError(t('terminal.streamError'));
    }
  }, [t]);

  const start = useCallback(async () => {
    setExited(false);
    setError('');
    try {
      const cols = termRef.current?.cols ?? 100;
      const rows = termRef.current?.rows ?? 30;
      await apiPost('/terminal/start', { cols, rows });
      attach();
    } catch {
      setError(t('terminal.startError'));
    }
  }, [attach, t]);

  // Mount: create the xterm, fit it, start/attach. Repo switch remounts via
  // the key on the page div below.
  useEffect(() => {
    const term = new XTerm({
      convertEol: false,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 5000,
      theme: { background: '#1e1e1e' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Desktop bonus: typing in the focused terminal goes straight to the PTY.
    const dataSub = term.onData((d) => {
      apiPost('/terminal/input', { data: d }).catch(() => { /* surfaced via composer sends */ });
    });

    start();

    const onResize = () => {
      fit.fit();
      apiPost('/terminal/resize', { cols: term.cols, rows: term.rows }).catch(() => { /* best-effort */ });
    };
    window.addEventListener('resize', onResize);

    // Re-fit once layout/fonts settle: the mount-time fit can measure a
    // pre-settle width and the PTY would stay the wrong size.
    const settleTimer = setTimeout(onResize, 350);

    // Reattach when the phone comes back from sleep/background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconcile();
    };
    const reconcile = async () => {
      try {
        const status = await apiGet('/terminal');
        if (status.running) attach();
        else setExited(true);
      } catch { /* keep current view */ }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      dataSub.dispose();
      abortRef.current?.abort();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRepoId]);

  const sendLine = async (e) => {
    e.preventDefault();
    await sendData(`${line}\r`);
    setLine('');
  };

  const kill = async () => {
    try {
      await apiPost('/terminal/kill');
      setExited(true);
    } catch {
      setError(t('terminal.killError'));
    }
  };

  return (
    <div className="terminal-page" key={currentRepoId}>
      <div className="terminal-toolbar">
        <span className="terminal-title">{t('terminal.title')}</span>
        {exited
          ? <button type="button" className="terminal-btn" onClick={start}>{t('terminal.restart')}</button>
          : <button type="button" className="terminal-btn terminal-btn--danger" onClick={kill}>{t('terminal.kill')}</button>}
      </div>

      {error && <div className="terminal-error" role="alert">{error}</div>}
      {exited && <div className="terminal-exited">{t('terminal.exited')}</div>}

      <div className="terminal-host" ref={hostRef} />

      <div className="terminal-keys" role="toolbar" aria-label={t('terminal.keysAria')}>
        {SPECIAL_KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="terminal-key"
            disabled={exited}
            onClick={() => sendData(k.data)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <form className="terminal-composer" onSubmit={sendLine}>
        <input
          className="terminal-input"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder={t('terminal.placeholder')}
          disabled={exited}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button type="submit" className="terminal-send" disabled={exited}>
          {t('terminal.send')}
        </button>
      </form>
    </div>
  );
}
