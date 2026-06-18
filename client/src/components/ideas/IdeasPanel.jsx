import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import ErrorBanner from '../shared/ErrorBanner';
import ArchPlanSection from './ArchPlanSection';
import TaskGraphPanel from '../taskgraph/TaskGraphPanel';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import './ideas.css';

// The Ideas surface (plans/ideas-pinned-dashboard.md): ONE global notes list
// (no longer per-project — reverses plans/ideas-tab.md). Self-contained:
// composer + list + edit/delete, fetched once from /api/notes. Rendered by both
// the Ideas tab (pages/Ideas.jsx) and the dashboard's pinned-left panel, so the
// behaviour lives in one place.
//
// Each idea has an OPTIONAL free-text `project` label, and a client-side fuzzy
// filter narrows the list as you type (plans/ideas-filter-project.md).
function relTime(ms, t) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t('ideas.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return t('ideas.minutesAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('ideas.hoursAgo', { n: h });
  const d = Math.round(h / 24);
  return t('ideas.daysAgo', { n: d });
}

// Literal substring filter: every whitespace-separated token in the query must
// appear as a contiguous substring of the target (case-insensitive). Multi-word
// queries are an AND across tokens, in any order. Empty query matches everything.
// (Was a subsequence match, which kept ideas whose letters only lined up in order
// across unrelated words — see plans/ideas-substring-filter.md.)
function substringMatch(query, target) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const s = (target || '').toLowerCase();
  return tokens.every((tok) => s.includes(tok));
}

// Priority (plans/idea-priority.md): 0 = none, 1–5 = increasing. The picker
// fills every dot up to the chosen level (a rating bar); clicking the current
// level again clears back to 0 / none.
const PRIORITY_LEVELS = [1, 2, 3, 4, 5];

function PriorityPicker({ value = 0, onChange, t }) {
  return (
    <div className="idea-prio" role="group" aria-label={t('ideas.priorityAria')}>
      {PRIORITY_LEVELS.map((lvl) => (
        <button
          type="button"
          key={lvl}
          className={`idea-prio__dot${value >= lvl ? ' idea-prio__dot--on' : ''}`}
          data-level={lvl}
          aria-pressed={value === lvl}
          title={t('ideas.prioritySet', { n: lvl })}
          onClick={() => onChange(value === lvl ? 0 : lvl)}
        >
          {lvl}
        </button>
      ))}
    </div>
  );
}

const TAB_KEY = 'claudeweb_ideas_tab'; // remembered tab: 'ideas' | 'plan' | 'graph'

export default function IdeasPanel() {
  const { t } = useT();
  // The task graph now lives here as a third tab (plans/ideas-taskgraph-merge.md).
  const graphOn = useFeature('taskGraph');

  const [tab, setTab] = useState(() => {
    const stored = localStorage.getItem(TAB_KEY);
    return stored === 'plan' || stored === 'graph' ? stored : 'ideas';
  });
  function chooseTab(next) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* private mode — in-memory only */
    }
  }

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftProject, setDraftProject] = useState('');
  const [draftPriority, setDraftPriority] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  const [filter, setFilter] = useState('');
  const draftRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiGet('/notes');
      setNotes(Array.isArray(data) ? data : []);
    } catch {
      setError(t('ideas.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Global list — fetch once on mount (no project dependency anymore).
  useEffect(() => {
    load();
  }, [load]);

  // Substring filter over both the idea text and its project label.
  const visible = useMemo(() => {
    const q = filter.trim();
    if (!q) return notes;
    return notes.filter((n) => substringMatch(q, `${n.text} ${n.project || ''}`));
  }, [notes, filter]);

  async function add() {
    const text = draft.trim();
    if (!text || adding) return;
    const project = draftProject.trim();
    setAdding(true);
    setError('');
    try {
      const note = await apiPost('/notes', { text, project, priority: draftPriority });
      setNotes((prev) => [note, ...prev]);
      setDraft('');
      setDraftProject('');
      setDraftPriority(0);
      draftRef.current?.focus();
    } catch {
      setError(t('ideas.saveError'));
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id) {
    const text = editDraft.trim();
    if (!text) return;
    const project = editProject.trim();
    const priority = editPriority;
    // Preserve the active flag — the PATCH overwrites it, so an omitted `active`
    // would silently clear it (the backend defaults missing -> false).
    const active = notes.find((n) => n.id === id)?.active ?? false;
    const prev = notes;
    setNotes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, text, project: project || null, priority, updatedAt: Date.now() } : n,
      ),
    );
    setEditingId(null);
    try {
      await apiPatch(`/notes/${id}`, { text, project, priority, active });
    } catch {
      setNotes(prev);
      setError(t('ideas.saveError'));
    }
  }

  // Quick priority change from the card (view mode), without entering edit: keep
  // the idea's existing text/project/active and patch only the level. Optimistic,
  // like edit/delete.
  async function changePriority(n, priority) {
    if ((n.priority || 0) === priority) return;
    const prev = notes;
    setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, priority } : x)));
    try {
      await apiPatch(`/notes/${n.id}`, { text: n.text, project: n.project || '', priority, active: !!n.active });
    } catch {
      setNotes(prev);
      setError(t('ideas.saveError'));
    }
  }

  // Move an idea into / out of the Active section. Optimistic, keeps the rest of
  // the idea unchanged. The grouped render reacts to the flipped `active` flag.
  async function toggleActive(n) {
    const active = !n.active;
    const prev = notes;
    setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, active } : x)));
    try {
      await apiPatch(`/notes/${n.id}`, { text: n.text, project: n.project || '', priority: n.priority || 0, active });
    } catch {
      setNotes(prev);
      setError(t('ideas.saveError'));
    }
  }

  // "Send to graph" (plans/ideas-taskgraph-merge.md): create a task-graph step
  // from this idea, then CONVERT the idea — keep it in the list but clear its
  // `active` flag (drops out of the Active section; no data loss). Jumps to the
  // Task graph tab so the new node is visible.
  async function sendToGraph(n) {
    setError('');
    try {
      await apiPost('/taskgraph/nodes', { title: n.text, note: n.project || undefined });
    } catch {
      setError(t('ideas.saveError'));
      return;
    }
    const prev = notes;
    setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, active: false } : x)));
    try {
      await apiPatch(`/notes/${n.id}`, { text: n.text, project: n.project || '', priority: n.priority || 0, active: false });
    } catch {
      setNotes(prev);
      setError(t('ideas.saveError'));
      return;
    }
    chooseTab('graph');
  }

  async function remove(id) {
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== id));
    try {
      await apiDelete(`/notes/${id}`);
    } catch {
      setNotes(prev);
      setError(t('ideas.deleteError'));
    }
  }

  function startEdit(n) {
    setEditingId(n.id);
    setEditDraft(n.text);
    setEditProject(n.project || '');
    setEditPriority(n.priority || 0);
  }

  // Ctrl/Cmd+Enter submits the composer (the textarea keeps plain Enter for newlines).
  function onDraftKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  // The visible list, split into the Active group (pinned on top) and the rest.
  // Within each group the existing newest-first order is preserved.
  const activeItems = visible.filter((n) => n.active);
  const backlogItems = visible.filter((n) => !n.active);

  function renderCard(n) {
    return (
      <div key={n.id} className="idea" data-priority={n.priority || 0} data-active={n.active ? '1' : undefined}>
        {editingId === n.id ? (
          <div className="idea__edit">
            <textarea
              className="ideas__input"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={3}
              autoFocus
            />
            <input
              className="ideas__input ideas__project"
              type="text"
              placeholder={t('ideas.projectPlaceholder')}
              value={editProject}
              onChange={(e) => setEditProject(e.target.value)}
            />
            <div className="idea__prio-edit">
              <span className="ideas__prio-label">{t('ideas.priority')}</span>
              <PriorityPicker value={editPriority} onChange={setEditPriority} t={t} />
            </div>
            <div className="idea__actions">
              <button type="button" className="idea__btn idea__btn--primary" onClick={() => saveEdit(n.id)} disabled={!editDraft.trim()}>
                {t('ideas.save')}
              </button>
              <button type="button" className="idea__btn" onClick={() => setEditingId(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="idea__text">{n.text}</p>
            <div className="idea__foot">
              {n.project && <span className="idea__project">{n.project}</span>}
              <PriorityPicker value={n.priority || 0} onChange={(lvl) => changePriority(n, lvl)} t={t} />
              <span className="idea__time">{relTime(n.updatedAt || n.createdAt, t)}</span>
              <button
                type="button"
                className={`idea__btn idea__active-btn${n.active ? ' idea__active-btn--on' : ''}`}
                title={n.active ? t('ideas.isActiveTitle') : t('ideas.makeActiveTitle')}
                aria-pressed={!!n.active}
                onClick={() => toggleActive(n)}
              >
                {n.active ? t('ideas.isActive') : t('ideas.makeActive')}
              </button>
              {n.active && graphOn && (
                <button
                  type="button"
                  className="idea__btn idea__graph-btn"
                  title="Create a task-graph step from this idea (keeps the idea, drops it from Active)"
                  onClick={() => sendToGraph(n)}
                >
                  🧩 Send to graph
                </button>
              )}
              <button type="button" className="idea__btn" onClick={() => startEdit(n)}>
                {t('ideas.edit')}
              </button>
              <button type="button" className="idea__btn idea__btn--danger" onClick={() => remove(n.id)}>
                {t('ideas.delete')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="ideas">
      <div className="ideas__tabs" role="tablist" aria-label={t('nav.ideas')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ideas'}
          className={`ideas__tab${tab === 'ideas' ? ' ideas__tab--active' : ''}`}
          onClick={() => chooseTab('ideas')}
        >
          {t('nav.ideas')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plan'}
          className={`ideas__tab${tab === 'plan' ? ' ideas__tab--active' : ''}`}
          onClick={() => chooseTab('plan')}
        >
          {t('archplan.title')}
        </button>
        {graphOn && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'graph'}
            className={`ideas__tab${tab === 'graph' ? ' ideas__tab--active' : ''}`}
            onClick={() => chooseTab('graph')}
          >
            🧩 Task graph
          </button>
        )}
      </div>

      {tab === 'plan' ? (
        <ArchPlanSection />
      ) : tab === 'graph' && graphOn ? (
        <div className="ideas__tabpanel ideas__tabpanel--graph">
          <TaskGraphPanel />
        </div>
      ) : (
        <div className="ideas__tabpanel">
      <div className="ideas__compose">
        <textarea
          ref={draftRef}
          className="ideas__input"
          placeholder={t('ideas.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKey}
          rows={3}
        />
        <input
          className="ideas__input ideas__project"
          type="text"
          placeholder={t('ideas.projectPlaceholder')}
          value={draftProject}
          onChange={(e) => setDraftProject(e.target.value)}
          onKeyDown={onDraftKey}
        />
        <div className="ideas__compose-row">
          <span className="ideas__prio-label">{t('ideas.priority')}</span>
          <PriorityPicker value={draftPriority} onChange={setDraftPriority} t={t} />
          <button type="button" className="ideas__add" onClick={add} disabled={adding || !draft.trim()}>
            {adding ? t('ideas.adding') : t('ideas.add')}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && notes.length > 0 && (
        <input
          className="ideas__input ideas__filter"
          type="search"
          placeholder={t('ideas.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="ideas__list">
        {loading ? (
          <p className="ideas__muted">{t('ideas.loading')}</p>
        ) : notes.length === 0 ? (
          <p className="ideas__muted">{t('ideas.empty')}</p>
        ) : visible.length === 0 ? (
          <p className="ideas__muted">{t('ideas.noMatches')}</p>
        ) : activeItems.length === 0 ? (
          // Nothing active → the flat list, exactly as before (no group headers).
          backlogItems.map(renderCard)
        ) : (
          <>
            <div className="ideas__group ideas__group--active">
              <div className="ideas__group-head">
                <span className="ideas__group-star" aria-hidden="true">★</span>
                {t('ideas.activeSection')}
                <span className="ideas__group-count">{activeItems.length}</span>
              </div>
              {activeItems.map(renderCard)}
            </div>
            {backlogItems.length > 0 && (
              <div className="ideas__group">
                <div className="ideas__group-head ideas__group-head--muted">
                  {t('ideas.backlogSection')}
                  <span className="ideas__group-count">{backlogItems.length}</span>
                </div>
                {backlogItems.map(renderCard)}
              </div>
            )}
          </>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
