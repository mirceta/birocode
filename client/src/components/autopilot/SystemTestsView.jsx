import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiGetBlob } from '../../api/client';
import '../../pages/autopilot.css';

// The "System Tests" sub-tab of the AutopilotConsole (understanding.md: real-runner).
// One inner sub-tab per loop-mode test I've made; each Run shells out (server-side)
// to the fixed Node/Playwright script and streams the result back here.
//
// HONESTY: these scripts need Node on the host (and Playwright for the three browser
// tests). When that's missing the run reports an explicit error — never a fake pass.
// "passed" means the script exited 0 (ran without throwing); the values it printed are
// in the output pane below, which is where you confirm the checks actually held.

const POLL_MS = 2000;

// Run status → badge class (reuses the st-* palette in autopilot.css) + label.
const STATUS = {
  idle: { cls: 'idle', label: 'not run' },
  running: { cls: 'run', label: 'running' },
  passed: { cls: 'sent', label: 'passed · exit 0' },
  failed: { cls: 'esc', label: 'failed' },
  error: { cls: 'esc', label: 'error' },
};

export default function SystemTestsView() {
  const [tests, setTests] = useState(null); // [{ id, title, checks, script, browser, status, output, ... }]
  const [sel, setSel] = useState(null); // selected test id
  const [error, setError] = useState('');
  const [shotUrl, setShotUrl] = useState(''); // object URL for the selected test's screenshot
  const shotKey = useRef(''); // `${id}:${artifactAt}` we last fetched, to avoid refetch loops
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet('/autopilot/systests');
      setTests(r.tests || []);
      setError('');
    } catch {
      setError('Could not load the system tests.');
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  // Default the selection to the first test once loaded.
  useEffect(() => {
    if (tests && !sel && tests.length) setSel(tests[0].id);
  }, [tests, sel]);

  const current = tests?.find((t) => t.id === sel) || null;

  // (Re)fetch the screenshot whenever the selected test has a fresh one. Auth is via
  // headers, so an <img src> can't load it directly — pull a blob and objectURL it.
  useEffect(() => {
    if (!current?.artifactReady) {
      setShotUrl('');
      shotKey.current = '';
      return;
    }
    const key = `${current.id}:${current.artifactAt}`;
    if (key === shotKey.current) return; // already showing this one
    shotKey.current = key;
    let revoked = false;
    let url = '';
    apiGetBlob(`/autopilot/systests/${current.id}/artifact`)
      .then((blob) => {
        if (revoked) return;
        url = URL.createObjectURL(blob);
        setShotUrl(url);
      })
      .catch(() => setShotUrl(''));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [current?.id, current?.artifactReady, current?.artifactAt]);

  const run = useCallback(async (id) => {
    try {
      const r = await apiPost(`/autopilot/systests/${id}/run`);
      if (r?.tests) setTests(r.tests);
      setError('');
    } catch {
      setError('Could not start the test.');
    }
  }, []);

  if (!tests) return <p className="autopilot__summary">Loading system tests…</p>;

  const st = STATUS[current?.status] ?? STATUS.idle;
  const running = current?.status === 'running';

  return (
    <div className="st-wrap">
      <div className="st-prereq" role="note">
        <strong>⚠ Playwright is required.</strong> These tests shell out to Node and the
        browser tests launch Chromium — <b>Node + Playwright must be installed on the host</b>,
        or every run here will fail with a prerequisite error.
      </div>
      <p className="autopilot__summary">
        The loop-mode tests, runnable here. Each spins up a fixed Node/Playwright script
        against <b>this running harness</b>. They need <b>Node</b> on the host (and
        <b> Playwright</b> for the browser tests) — if that’s missing the run says so
        plainly instead of faking a pass. “Passed” = the script exited cleanly; read its
        output to confirm the values look right.
      </p>

      {error && <p className="autopilot__summary" style={{ color: '#b3261e' }}>{error}</p>}

      {/* inner sub-tabs, one per test */}
      <nav className="st-subtabs">
        {tests.map((t) => {
          const s = STATUS[t.status] ?? STATUS.idle;
          return (
            <button key={t.id} className={t.id === sel ? 'on' : ''} onClick={() => setSel(t.id)}>
              {t.title}
              <span className={`st-dot st-dot--${s.cls}`} title={s.label} />
            </button>
          );
        })}
      </nav>

      {current && (
        <div className="st-panel">
          <div className="st-panel__head">
            <div>
              <h3 className="st-panel__title">{current.title}</h3>
              <p className="st-panel__checks">{current.checks}</p>
              <div className="st-meta">
                <code className="st-script">{current.script}</code>
                <span className={`st-tag ${current.browser ? 'st-tag--browser' : 'st-tag--api'}`}>
                  {current.browser ? 'browser · needs Playwright' : 'fetch · no browser'}
                </span>
              </div>
            </div>
            <div className="st-panel__run">
              <span className={`ap-state st-${st.cls}`}>
                {running && <span className="ap-spinner" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
                {st.label}
              </span>
              <button className="lp-arm st-run-btn" onClick={() => run(current.id)} disabled={running}>
                {running ? 'Running…' : '▶ Run test'}
              </button>
            </div>
          </div>

          {(current.startedAt || current.finishedAt) && (
            <div className="st-times">
              {current.startedAt && <span>started {new Date(current.startedAt).toLocaleTimeString()}</span>}
              {current.finishedAt && <span>· finished {new Date(current.finishedAt).toLocaleTimeString()}</span>}
              {current.exitCode != null && <span>· exit {current.exitCode}</span>}
            </div>
          )}

          {/* live / last output */}
          <pre className="st-output">
            {current.output?.trim() ? current.output : <span className="ap-muted">No output yet — press Run.</span>}
          </pre>

          {/* screenshot artifact (browser tests) */}
          {current.hasArtifact && (
            <div className="st-shot">
              <div className="st-shot__head">
                Screenshot
                {!current.artifactReady && <span className="ap-muted"> — none yet (run the test)</span>}
              </div>
              {current.artifactReady && shotUrl && (
                <a href={shotUrl} target="_blank" rel="noreferrer">
                  <img className="st-shot__img" src={shotUrl} alt={`${current.title} screenshot`} />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
