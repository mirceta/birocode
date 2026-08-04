import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import Markdown from '../shared/Markdown';

// Research subtab under the console's Reference root (openspec
// research-informed-loops): renders the COMMITTED agent-loop research dossier
// from docs/research/agent-loops/ — never a hand-maintained copy, so a
// refreshed dossier shows up here with no UI change. Reads repo files through
// the ungated files endpoint (the UnderstandingPanel pattern), which is why
// this view stays visible when the /api/autopilot operator gate is off.
const ROOT = 'docs/research/agent-loops';

// The synthesis pair leads; the per-source documents are listed live from
// sources/ so new practitioners appear without touching this file.
const PRIMARY = [
  ['adoption-map.md', 'Adoption map'],
  ['techniques.md', 'Technique catalog'],
  ['README.md', 'About the dossier'],
];

// Resolve a repo-relative .md link inside the dossier against the currently
// open document (e.g. "sources/boris-cherny.md" from the adoption map, or
// "../techniques.md" from a source doc). Returns null for links that leave
// the dossier — those keep the renderer's default behavior.
function resolveDocLink(current, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean.toLowerCase().endsWith('.md')) return null;
  const base = current.includes('/') ? current.slice(0, current.lastIndexOf('/') + 1) : '';
  const out = [];
  for (const part of `${base}${clean}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

export default function ResearchView() {
  const [doc, setDoc] = useState('adoption-map.md'); // path relative to ROOT
  const [content, setContent] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing
  const [sources, setSources] = useState([]); // file names under sources/
  // The dossier lives in the harness's own repo, so reads are pinned to the
  // self repo (X-Repo-Id) — the tab renders no matter which project is
  // selected. null = still resolving, '' = no self repo (fall back to current).
  const [selfRepo, setSelfRepo] = useState(null);

  useEffect(() => {
    let alive = true;
    apiGet('/repos')
      .then((repos) => {
        if (!alive) return;
        setSelfRepo((Array.isArray(repos) ? repos : []).find((r) => r.isSelf)?.id || '');
      })
      .catch(() => { if (alive) setSelfRepo(''); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (selfRepo == null) return;
    let alive = true;
    apiGet(`/files?path=${encodeURIComponent(`${ROOT}/sources`)}`, selfRepo ? { repoId: selfRepo } : {})
      .then((entries) => {
        if (!alive) return;
        const files = (Array.isArray(entries) ? entries : [])
          .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
          .map((e) => e.name);
        setSources(files);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [selfRepo]);

  const load = useCallback(async (path) => {
    if (selfRepo == null) return;
    setState('loading');
    try {
      const file = await apiGet(
        `/files/read?path=${encodeURIComponent(`${ROOT}/${path}`)}`,
        selfRepo ? { repoId: selfRepo } : {},
      );
      const text = typeof file === 'string' ? file : (file?.content ?? '');
      if (text && text.trim()) {
        setContent(text);
        setState('ok');
      } else {
        setState('missing');
      }
    } catch {
      setState('missing');
    }
  }, [selfRepo]);

  useEffect(() => {
    load(doc);
  }, [doc, load]);

  const followLink = (href) => {
    const target = resolveDocLink(doc, href);
    if (target) setDoc(target);
  };

  // Turn "boris-cherny.md" into "Boris Cherny" for the source pills.
  const sourceLabel = (name) =>
    name.replace(/\.md$/i, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <section className="ap-research" aria-label="Agent-loop research dossier">
      <p className="autopilot__summary">
        How credible practitioners run agentic loops — the committed, source-cited
        dossier from <code>docs/research/agent-loops/</code>, confronted with this
        harness's own loop framework. Read-only; refresh the dossier files to update this view.
      </p>

      <nav className="ap-research__picker">
        {PRIMARY.map(([key, label]) => (
          <button key={key} className={doc === key ? 'on' : ''} onClick={() => setDoc(key)}>
            {label}
          </button>
        ))}
        {sources.length > 0 && <span className="ap-research__divider">Sources:</span>}
        {sources.map((name) => (
          <button
            key={name}
            className={doc === `sources/${name}` ? 'on' : ''}
            onClick={() => setDoc(`sources/${name}`)}
          >
            {sourceLabel(name)}
          </button>
        ))}
      </nav>

      {state === 'loading' && <p className="ap-research__empty">Loading…</p>}
      {state === 'missing' && (
        <div className="ap-research__empty" role="status">
          <b>{doc}</b> isn't committed (yet). The dossier lives at{' '}
          <code>docs/research/agent-loops/</code> and is produced by the OpenSpec change{' '}
          <code>research-informed-loops</code> — once the file lands in the repo it renders here.
        </div>
      )}
      {state === 'ok' && (
        <div className="ap-research__doc">
          <Markdown onLinkClick={followLink}>{content}</Markdown>
        </div>
      )}
    </section>
  );
}
