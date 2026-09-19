import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiDelete } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { ago } from '../components/taskgraph/cardSections';
import { buildTree, flattenTree, folderPaths, toggleCollapsed } from './fileTree';
import './fileSystem.css';

// The File System tab (openspec hub-file-system; tree + unbounded sizes since
// hubfs-large-files-tree): the LIVE state of the hub file system — this hub's store and every
// reachable peer's, one block per machine, each rendered as a collapsible TREE (every slash of a
// hub path is a folder level; folder rows carry count / total size / latest change, leaf rows the
// file's provenance, size, version, note), a download link and the Operator's delete, running
// transfer jobs with progress — plus the how-to. The how-to's phrasings and rules come from the
// harness (GET /api/hubfs → howTo), so they can never drift from the tools.

const POLL_MS = 5000;
const STALE_MS = 30 * 24 * 3600_000;

function human(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FileTree({ files, now, machine, canDelete, onDelete, t }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const tree = useMemo(() => buildTree(files), [files]);
  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);
  if (!files.length) return <div className="fs__empty" data-fs-empty={machine}>{t('fs.empty')}</div>;
  const allFolders = folderPaths(tree);
  return (
    <div data-fs-tree={machine}>
      {allFolders.length > 0 && (
        <div className="fs__treebar">
          <button type="button" className="fs__btn" onClick={() => setCollapsed(new Set())} data-fs-expand-all={machine}>{t('fs.expandAll')}</button>
          <button type="button" className="fs__btn" onClick={() => setCollapsed(new Set(allFolders))} data-fs-collapse-all={machine}>{t('fs.collapseAll')}</button>
        </div>
      )}
      <table className="fs__table" data-fs-table={machine}>
        <thead><tr><th>{t('fs.col.path')}</th><th>{t('fs.col.by')}</th><th>{t('fs.col.when')}</th><th className="fs__num">{t('fs.col.size')}</th><th className="fs__num">v</th><th>{t('fs.col.note')}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            if (r.type === 'folder') {
              const d = r.node;
              return (
                <tr key={`${machine}:d:${d.path}`} className="fs__row fs__row--folder" data-fs-folder={d.path} data-fs-open={r.open ? '1' : '0'} onClick={() => setCollapsed((c) => toggleCollapsed(c, d.path))}>
                  <td className="fs__path" style={{ paddingLeft: 8 + r.depth * 18 }}>
                    <button type="button" className="fs__twisty" aria-expanded={r.open} data-fs-toggle={d.path}>{r.open ? '▾' : '▸'}</button>
                    <span className="fs__fname">📁 {d.name}/</span>
                    <span className="fs__dim"> · {d.count} {t('fs.files')}</span>
                  </td>
                  <td className="fs__dim" />
                  <td className="fs__dim">{d.latest ? `${ago(now - d.latest)} ${t('fs.ago')}` : ''}</td>
                  <td className="fs__num fs__dim">{human(d.bytes)}</td>
                  <td className="fs__num" />
                  <td />
                  <td />
                </tr>
              );
            }
            const f = r.file;
            const stale = f.updatedAt && now - f.updatedAt > STALE_MS;
            return (
              <tr key={`${machine}:${f.path}`} className={`fs__row${stale ? ' fs__row--stale' : ''}`} data-fs-file={f.path} data-fs-stale={stale ? '1' : '0'}>
                <td className="fs__path" style={{ paddingLeft: 8 + r.depth * 18 }}><code title={f.path}>{r.name}</code>{f.via ? <span className="fs__via" title={t('fs.viaTitle')}> · {f.via}</span> : null}</td>
                <td>{f.uploadedBy}<span className="fs__dim"> @ {f.uploadedFrom}</span></td>
                <td title={new Date(f.updatedAt || f.uploadedAt).toLocaleString('en-US')}>{ago(now - (f.updatedAt || f.uploadedAt))} {t('fs.ago')}{stale ? <span className="fs__stale" data-fs-stale-badge> · {t('fs.stale')}</span> : null}</td>
                <td className="fs__num">{f.sizeHuman || human(f.size)}</td>
                <td className="fs__num">{f.version}</td>
                <td className="fs__note">{f.note || ''}</td>
                <td className="fs__actions">
                  {canDelete ? <a className="fs__btn" href={`/api/hubfs/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer" data-fs-download={f.path}>⬇</a> : null}
                  {canDelete ? <button type="button" className="fs__btn fs__btn--danger" onClick={() => onDelete(f.path)} data-fs-delete={f.path} title={t('fs.deleteTitle')}>✕</button> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Transfers({ transfers, now, t }) {
  if (!transfers?.length) return null;
  return (
    <div className="fs__transfers" data-fs-transfers>
      <h4 className="fs__mh">🔁 {t('fs.transfers')}</h4>
      <ul>
        {transfers.map((j) => (
          <li key={j.jobId} data-fs-transfer={j.jobId} data-fs-transfer-status={j.status}>
            <code>{j.path}</code> {j.from} → {j.to} · <b>{j.status}</b>
            {j.status === 'running' ? <> · {j.bytesHuman}{j.total ? ` / ${human(j.total)}` : ''}{j.percent != null ? ` (${j.percent}%)` : ''}</> : <span className="fs__dim"> · {j.detail}</span>}
            <span className="fs__dim"> · {ago(now - j.startedAt)} {t('fs.ago')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FileSystem({ root }) {
  const { t } = useT();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/hubfs');
      setSt(d);
      setErr('');
      setNow(Date.now());
    } catch (e) { setErr(e?.message || String(e)); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const del = async (path) => {
    setBusy(true);
    try { await apiDelete(`/hubfs/file?path=${encodeURIComponent(path)}`); setConfirm(null); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const stats = st?.stats;
  const total = useMemo(() => (st?.files?.length || 0) + (st?.peers || []).reduce((n, p) => n + (p.files?.length || 0), 0), [st]);
  const howTo = st?.howTo;

  return (
    <div className="mg__status fs" data-fs-pane>
      <section className="fs__sec" data-fs-live>
        <div className="fs__head">
          <h3 className="mg__status-h">🗂 {t('fs.title', { hub: st?.machine || '…' })}</h3>
          {stats && <span className="fs__stats" data-fs-stats>{t('fs.stats', { n: total, bytes: human(stats.bytes), free: stats.freeBytes != null ? human(stats.freeBytes) : '?' })}</span>}
          <button type="button" className="fs__btn" onClick={load} data-fs-refresh>↻</button>
        </div>
        <p className="fs__lead">{t('fs.lead')}</p>
        {err && <div className="fs__err" role="alert" data-fs-error>{err}</div>}
        {!st ? <div className="fs__dim">{t('fs.loading')}</div> : (
          <>
            <Transfers transfers={st.transfers} now={now} t={t} />
            <div className="fs__machine" data-fs-machine={st.machine} data-fs-self="1">
              <h4 className="fs__mh">🗂 {st.machine} <span className="fs__dim">· {t('fs.thisHub')} · {st.files.length} {t('fs.files')}</span></h4>
              <FileTree files={st.files} now={now} machine={st.machine} canDelete onDelete={(p) => setConfirm(p)} t={t} />
            </div>
            {(st.peers || []).map((p) => (
              <div className="fs__machine" key={p.sourceId} data-fs-machine={p.machine} data-fs-peer-status={p.status}>
                <h4 className="fs__mh">🖥 {p.machine} <span className="fs__dim">· {p.status === 'ok' ? `${p.files.length} ${t('fs.files')}` : `${p.status}${p.detail ? ` — ${p.detail}` : ''}`}{p.allowSends ? '' : ` · ${t('fs.noSends')}`}</span></h4>
                {p.status === 'ok' ? <FileTree files={p.files} now={now} machine={p.machine} canDelete={false} onDelete={() => {}} t={t} /> : null}
              </div>
            ))}
          </>
        )}
        {confirm && (
          <div className="fs__confirm" role="dialog" data-fs-confirm>
            <span>{t('fs.confirmDelete', { path: confirm })}</span>
            <button type="button" className="fs__btn fs__btn--danger" onClick={() => del(confirm)} disabled={busy} data-fs-confirm-yes>{t('fs.deleteNow')}</button>
            <button type="button" className="fs__btn" onClick={() => setConfirm(null)} disabled={busy} data-fs-confirm-no>{t('fs.cancel')}</button>
          </div>
        )}
      </section>

      <section className="fs__sec fs__howto" data-fs-howto>
        <h3 className="mg__status-h">📋 {t('fs.howTitle')}</h3>
        <p className="fs__lead">{t('fs.howLead')}</p>
        {howTo ? (
          <div className="fs__how">
            <div className="fs__howcol" data-fs-howto-arch>
              <h4>🏛 {t('fs.howArch')}</h4>
              <ul>{howTo.arch.map((s, i) => <li key={i}><code className="fs__say">{s}</code></li>)}</ul>
              <p className="fs__dim">{t('fs.howArchNote', { tools: howTo.tools.arch.join(', ') })}</p>
            </div>
            <div className="fs__howcol" data-fs-howto-agent>
              <h4>🤖 {t('fs.howAgent')}</h4>
              <ul>{howTo.repoAgent.map((s, i) => <li key={i}><code className="fs__say">{s}</code></li>)}</ul>
              <p className="fs__dim">{t('fs.howAgentNote', { tools: howTo.tools.repoAgent.join(', ') })}</p>
            </div>
          </div>
        ) : null}
        {howTo ? (
          <div className="fs__rules" data-fs-rules>
            <h4>{t('fs.rules')}</h4>
            <ul>{howTo.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
