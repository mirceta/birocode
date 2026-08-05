import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client';
import Markdown from '../shared/Markdown';

// Research subtab under the console's Reference root (openspec
// research-informed-loops): the interactive technique explorer (same shape as
// the understanding-app companion) over the COMMITTED dossier at
// docs/research/agent-loops/ — never a hand-maintained copy. The structured
// catalog is docs/research/agent-loops/techniques.json; the prose documents
// stay readable behind the Documents pills. Reads go through the ungated files
// endpoint (the UnderstandingPanel pattern), which is why this view stays
// visible when the /api/autopilot operator gate is off.
const ROOT = 'docs/research/agent-loops';
const EXPLORER = '__explorer__';

const PRIMARY = [
  ['adoption-map.md', 'Adoption map'],
  ['techniques.md', 'Technique catalog'],
  ['README.md', 'About the dossier'],
];

const BUCKET = {
  adopt: { label: '★ worth adopting', cls: 'adopt' },
  have: { label: '✓ already have', cls: 'have' },
  na: { label: '— not applicable', cls: 'na' },
};

const BUCKET_FILTERS = [
  ['all', 'all buckets'],
  ['adopt', '★ worth adopting'],
  ['have', '✓ already have'],
  ['na', '— not applicable'],
];
const EVIDENCE_FILTERS = [
  ['all', 'all evidence'],
  ['demonstrated', 'demonstrated'],
  ['recommended', 'recommended'],
  ['secondhand', 'secondhand'],
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

function TechniqueBadges({ t }) {
  return (
    <div className="ap-research__badges">
      {t.rank != null && <span className="ap-rbadge ap-rbadge--rank">rank {t.rank}</span>}
      <span className={`ap-rbadge ap-rbadge--${BUCKET[t.bucket].cls}`}>{BUCKET[t.bucket].label}</span>
      <span className={`ap-rbadge ap-rbadge--${t.evidence}`}>{t.evidence}</span>
    </div>
  );
}

export default function ResearchView() {
  const [doc, setDoc] = useState(EXPLORER); // EXPLORER or path relative to ROOT
  const [content, setContent] = useState(null);
  const [state, setState] = useState('ok'); // loading | ok | missing (doc view)
  const [sources, setSources] = useState([]); // file names under sources/
  const [catalog, setCatalog] = useState(null); // parsed techniques.json, or 'missing'
  const [bucket, setBucket] = useState('all');
  const [evidence, setEvidence] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // technique in the detail panel
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
    const repoOpt = selfRepo ? { repoId: selfRepo } : {};
    let alive = true;
    apiGet(`/files?path=${encodeURIComponent(`${ROOT}/sources`)}`, repoOpt)
      .then((entries) => {
        if (!alive) return;
        const files = (Array.isArray(entries) ? entries : [])
          .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
          .map((e) => e.name);
        setSources(files);
      })
      .catch(() => {});
    apiGet(`/files/read?path=${encodeURIComponent(`${ROOT}/techniques.json`)}`, repoOpt)
      .then((file) => {
        if (!alive) return;
        const text = typeof file === 'string' ? file : (file?.content ?? '');
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.techniques) && parsed.techniques.length) setCatalog(parsed);
        else setCatalog('missing');
      })
      .catch(() => { if (alive) setCatalog('missing'); });
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
    if (doc !== EXPLORER) load(doc);
  }, [doc, load]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const followLink = (href) => {
    const target = resolveDocLink(doc, href);
    if (target) setDoc(target);
  };

  // Turn "boris-cherny.md" into "Boris Cherny" for the source pills.
  const sourceLabel = (name) =>
    name.replace(/\.md$/i, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const techniques = catalog && catalog !== 'missing' ? catalog.techniques : [];

  const counts = useMemo(() => {
    const c = { adopt: 0, have: 0, na: 0 };
    techniques.forEach((t) => { c[t.bucket] += 1; });
    return c;
  }, [techniques]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return techniques.filter((t) => {
      if (bucket !== 'all' && t.bucket !== bucket) return false;
      if (evidence !== 'all' && t.evidence !== evidence) return false;
      if (q && !(`${t.id} ${t.name} ${t.gist} ${t.verdict}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [techniques, bucket, evidence, query]);

  const ladder = useMemo(
    () => techniques.filter((t) => t.bucket === 'adopt').sort((a, b) => a.rank - b.rank),
    [techniques],
  );

  const openSource = (name) => {
    setSelected(null);
    setDoc(`sources/${name}`);
  };

  const verdictLabel = (t) =>
    t.bucket === 'adopt' ? 'Gap + landing site' : t.bucket === 'have' ? 'Where we already have it' : 'Why not applicable';

  return (
    <section className="ap-research" aria-label="Agent-loop research dossier">
      <p className="autopilot__summary">
        How credible practitioners run agentic loops — the committed, source-cited
        dossier from <code>docs/research/agent-loops/</code>, confronted with this
        harness's own loop framework. Read-only; refresh the dossier files to update this view.
      </p>

      <nav className="ap-research__picker">
        <button className={doc === EXPLORER ? 'on' : ''} onClick={() => setDoc(EXPLORER)}>
          ✦ Explorer
        </button>
        <span className="ap-research__divider">Documents:</span>
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

      {doc === EXPLORER && catalog == null && <p className="ap-research__empty">Loading…</p>}
      {doc === EXPLORER && catalog === 'missing' && (
        <div className="ap-research__empty" role="status">
          <b>techniques.json</b> isn't committed (yet). The structured catalog lives at{' '}
          <code>docs/research/agent-loops/techniques.json</code> — once it lands in the repo the
          explorer renders here; the Documents pills above still show the prose dossier.
        </div>
      )}

      {doc === EXPLORER && catalog != null && catalog !== 'missing' && (
        <div className="ap-research__explorer">
          <div className="ap-research__stats">
            <span className="ap-rstat"><b>{techniques.length}</b> techniques</span>
            <span className="ap-rstat"><b>{counts.have}</b> already have</span>
            <span className="ap-rstat"><b>{counts.adopt}</b> worth adopting</span>
            <span className="ap-rstat"><b>{counts.na}</b> not applicable</span>
            <span className="ap-rstat">
              <b>{catalog.sourceCount}</b> sources · cited + retrieval-dated {catalog.retrieved}
            </span>
          </div>

          <div className="ap-research__filters">
            <div className="ap-research__fgroup">
              {BUCKET_FILTERS.map(([val, label]) => (
                <button key={val} className={bucket === val ? 'on' : ''} onClick={() => setBucket(val)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ap-research__fgroup">
              {EVIDENCE_FILTERS.map(([val, label]) => (
                <button key={val} className={evidence === val ? 'on' : ''} onClick={() => setEvidence(val)}>
                  {label}
                </button>
              ))}
            </div>
            <input
              className="ap-research__search"
              type="search"
              placeholder="filter techniques…"
              aria-label="Filter techniques"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {ladder.length > 0 && (
            <div className="ap-research__ranked">
              <h3>
                The worth-adopting ladder{' '}
                <span className="ap-research__hint">(each rank seeds one follow-up OpenSpec change — click to inspect)</span>
              </h3>
              <ol className="ap-research__ladder">
                {ladder.map((t) => (
                  <li key={t.id} onClick={() => setSelected(t)}>
                    <span className="ap-research__lname">{t.id} — {t.name}</span>{' '}
                    <span className="ap-research__lgap">· {t.verdict.split('Landing:')[0].trim()}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="ap-research__grid">
            {visible.map((t) => (
              <article key={t.id} className="ap-research__card" onClick={() => setSelected(t)}>
                <span className="ap-research__cardid">{t.id} · {t.section}</span>
                <span className="ap-research__cardname">{t.name}</span>
                <TechniqueBadges t={t} />
              </article>
            ))}
            {visible.length === 0 && (
              <p className="ap-research__empty">No technique matches the current filters.</p>
            )}
          </div>
        </div>
      )}

      {doc !== EXPLORER && state === 'loading' && <p className="ap-research__empty">Loading…</p>}
      {doc !== EXPLORER && state === 'missing' && (
        <div className="ap-research__empty" role="status">
          <b>{doc}</b> isn't committed (yet). The dossier lives at{' '}
          <code>docs/research/agent-loops/</code> and is produced by the OpenSpec change{' '}
          <code>research-informed-loops</code> — once the file lands in the repo it renders here.
        </div>
      )}
      {doc !== EXPLORER && state === 'ok' && (
        <div className="ap-research__doc">
          <Markdown onLinkClick={followLink}>{content}</Markdown>
        </div>
      )}

      {selected && (
        <aside className="ap-research__detail" aria-label={`${selected.id} detail`}>
          <button className="ap-research__close" aria-label="Close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <span className="ap-research__cardid">{selected.id} · {selected.section}</span>
          <h3>{selected.name}</h3>
          <TechniqueBadges t={selected} />
          <p className="ap-research__gist">{selected.gist}</p>
          <div className="ap-research__sect">
            <h4>Sources (docs/research/agent-loops/sources/)</h4>
            <div className="ap-research__srcs">
              {selected.sources.map((s) => (
                <button key={s} onClick={() => openSource(`${s}.md`)}>{s}.md</button>
              ))}
            </div>
          </div>
          <div className="ap-research__sect">
            <h4>{verdictLabel(selected)}</h4>
            <div className={`ap-research__verdict ap-research__verdict--${BUCKET[selected.bucket].cls}`}>
              {selected.verdict}
            </div>
          </div>
        </aside>
      )}
    </section>
  );
}
