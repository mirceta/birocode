import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { apiGet, apiPost, apiStreamGet } from '../api/client';
import SessionPicker from '../components/chat/SessionPicker';
import { createSseParser } from '../components/chat/sseParser';
import ClaudeViewToggle from '../components/shared/ClaudeViewToggle';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './terminal.css';

// Terminal view (plans/terminal-tab.md + plans/terminal-sessions.md):
// backend-owned PowerShells on ConPTY pseudo-consoles, several per repo,
// rendered with ONE xterm.js instance. Switching sessions aborts the SSE
// attachment, resets the xterm, and replays the chosen shell's buffer (the
// reattach mechanism from the original terminal tab, reused verbatim).
// "Resume a conversation" starts a fresh shell that auto-runs
// `claude --resume <id>` — decision (a): you land mid-conversation.
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
  const activeRef = useRef(null); // termId the input paths target (avoids stale closures)

  const [shells, setShells] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [line, setLine] = useState('');
  const [exited, setExited] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [convosLoading, setConvosLoading] = useState(false);
  const [convosError, setConvosError] = useState('');

  activeRef.current = activeId;

  const refreshShells = useCallback(async () => {
    const list = await apiGet('/terminal/list');
    setShells(list);
    return list;
  }, []);

  const sendData = useCallback(async (data) => {
    if (!activeRef.current) return;
    try {
      await apiPost('/terminal/input', { termId: activeRef.current, data });
      setError('');
    } catch {
      setError(t('terminal.sendError'));
    }
  }, [t]);

  // One attachment to one shell: reset the xterm, replay, stream live.
  const attach = useCallback(async (termId) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    termRef.current?.reset();
    setExited(false);
    const parse = createSseParser((evt) => {
      if (evt.type === 'data' && evt.data) termRef.current?.write(b64ToBytes(evt.data));
      if (evt.type === 'exit' && activeRef.current === termId) setExited(true);
    });
    try {
      await apiStreamGet(`/terminal/stream?termId=${encodeURIComponent(termId)}`, parse, {
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name !== 'AbortError') setError(t('terminal.streamError'));
    }
  }, [t]);

  const startShell = useCallback(async (resumeSessionId, label) => {
    setError('');
    try {
      const cols = termRef.current?.cols ?? 100;
      const rows = termRef.current?.rows ?? 30;
      const shell = await apiPost('/terminal/start', { cols, rows, resumeSessionId, label });
      await refreshShells();
      setActiveId(shell.termId);
      return shell;
    } catch (err) {
      // 409 = per-repo live-shell cap; surface the server's message.
      setError(err?.status === 409 ? t('terminal.capError') : t('terminal.startError'));
      return null;
    }
  }, [refreshShells, t]);

  // Mount / repo switch: build the xterm, then reconcile with the backend —
  // adopt existing shells or start the first one.
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
      if (activeRef.current) {
        apiPost('/terminal/input', { termId: activeRef.current, data: d }).catch(() => { /* surfaced via composer sends */ });
      }
    });

    (async () => {
      try {
        const list = await refreshShells();
        if (list.length > 0) setActiveId(list[0].termId);
        else await startShell();
      } catch {
        setError(t('terminal.startError'));
      }
    })();

    const onResize = () => {
      fit.fit();
      if (activeRef.current) {
        apiPost('/terminal/resize', { termId: activeRef.current, cols: term.cols, rows: term.rows })
          .catch(() => { /* best-effort */ });
      }
    };
    window.addEventListener('resize', onResize);
    const settleTimer = setTimeout(onResize, 350);

    // Phone returns from sleep/background: reconcile and reattach.
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const list = await refreshShells();
        const current = list.find((s) => s.termId === activeRef.current);
        if (current) attach(current.termId);
        else if (list.length > 0) setActiveId(list[0].termId);
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

  // Attach whenever the active shell changes; tell the PTY our size.
  useEffect(() => {
    if (!activeId) return;
    attach(activeId);
    const term = termRef.current;
    if (term) {
      apiPost('/terminal/resize', { termId: activeId, cols: term.cols, rows: term.rows })
        .catch(() => { /* best-effort */ });
    }
  }, [activeId, attach]);

  const sendLine = async (e) => {
    e.preventDefault();
    await sendData(`${line}\r`);
    setLine('');
  };

  const kill = async () => {
    if (!activeId) return;
    try {
      await apiPost('/terminal/kill', { termId: activeId });
      const list = await refreshShells();
      if (list.length > 0) setActiveId(list[0].termId);
      else {
        setActiveId(null);
        setExited(true);
        termRef.current?.reset();
      }
    } catch {
      setError(t('terminal.killError'));
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setConvosLoading(true);
    setConvosError('');
    try {
      setConversations(await apiGet('/sessions'));
    } catch {
      setConvosError(t('picker.loadError'));
    } finally {
      setConvosLoading(false);
    }
  };

  const resumeConversation = async (sessionId) => {
    setPickerOpen(false);
    const convo = conversations.find((c) => c.id === sessionId);
    const label = `↻ ${(convo?.title || convo?.firstPrompt || sessionId).slice(0, 30)}`;
    await startShell(sessionId, label);
  };

  const newShell = async () => {
    setPickerOpen(false);
    await startShell();
  };

  return (
    <div className="terminal-page" key={currentRepoId}>
      <div className="terminal-toolbar">
        <ClaudeViewToggle />
        {activeId && (
          <button type="button" className="terminal-btn terminal-btn--danger" onClick={kill}>
            {t('terminal.kill')}
          </button>
        )}
      </div>

      <div className="terminal-strip" role="tablist" aria-label={t('terminal.shellsAria')}>
        {shells.map((s) => (
          <button
            key={s.termId}
            type="button"
            role="tab"
            aria-selected={s.termId === activeId}
            className={`terminal-chip${s.termId === activeId ? ' is-active' : ''}`}
            onClick={() => setActiveId(s.termId)}
            title={s.label}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="terminal-chip terminal-chip--add"
          onClick={openPicker}
          aria-label={t('terminal.addShell')}
        >
          +
        </button>
      </div>

      {error && <div className="terminal-error" role="alert">{error}</div>}
      {exited && !activeId && (
        <div className="terminal-exited">
          {t('terminal.exited')}{' '}
          <button type="button" className="terminal-btn" onClick={() => startShell()}>
            {t('terminal.restart')}
          </button>
        </div>
      )}
      {exited && activeId && <div className="terminal-exited">{t('terminal.shellExited')}</div>}

      <div className="terminal-host" ref={hostRef} />

      <div className="terminal-keys" role="toolbar" aria-label={t('terminal.keysAria')}>
        {SPECIAL_KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="terminal-key"
            disabled={!activeId || exited}
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
          disabled={!activeId || exited}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button type="submit" className="terminal-send" disabled={!activeId || exited}>
          {t('terminal.send')}
        </button>
      </form>

      <SessionPicker
        open={pickerOpen}
        sessions={conversations}
        loading={convosLoading}
        error={convosError ? true : null}
        activeId={null}
        onSelect={resumeConversation}
        onNew={newShell}
        onClose={() => setPickerOpen(false)}
        title={t('terminal.pickerTitle')}
        newLabel={t('terminal.newShell')}
      />
    </div>
  );
}
