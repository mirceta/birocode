import { useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// Dashboard dock toolbar (openspec add-dashboard-dock-toolbar): a horizontal,
// overflow-scrolling strip listing EVERY dock in the roster — including ones
// currently hidden from the grid — as a toggleable tab. A tab is "active" when
// its dock renders in the grid (dashboard !== false); clicking it flips the
// dock's existing `dashboard` visibility field (via the parent's updateTab), so
// hiding/showing here stays in sync with the Agents-page ▦ toggle. No local
// duplicate state: the tabs re-derive from the same dock roster the grid reads.
// Each tab's dot keeps the dock's assigned color at rest and turns near-black
// while a prompt is running on that agent (openspec dock-busy-indicator) — the
// `live` map covers the full roster, so this works for hidden docks too. A run
// that finishes while the dock is HIDDEN latches the server-owned
// `unseenResult` flag (unseen-result amendment): the dot becomes an
// exclamation point until the dock is shown again, so the finish isn't
// silently read as "idle". Running outranks the exclamation; an active
// (grid-visible) tab never shows one — showing is what clears the latch.
//
// Two display-only indicators per tab (openspec dock-toolbar-star-and-branch):
// a ★ on the right when the dock's server-persisted `important` flag is set
// (same visual language as the panel/grid star controls, but NOT a toggle
// here), and a second row under the name showing the repo's git branch from
// the dashboard's per-repo `git` map — omitted entirely when no branch is
// known. Both are also spoken via the tab's composed aria-label/title.
//
// Reorder mode (same openspec change): the ⇄ toggle next to the strip label
// makes tab clicks MODE-DEPENDENT. Off (default), a click hides/shows the
// dock as ever. On, clicks pick-and-place instead: the first tap picks a tab
// up, a tap on another tab moves the picked tab to that tab's position
// (before it moving front-ward, after it moving back-ward — so both ends are
// reachable), a tap on the picked tab cancels. A completed move calls
// `onReorder` with the FULL new id order; the parent persists it as the
// roster order, which the strip AND the grid render in. Mode + pick state
// are view-local and reset on unmount.
//
// Strip filter (openspec dock-strip-amendments): a segmented control narrows
// which tabs RENDER. The branch states (All / on main / not on main) classify
// each tab from the same per-repo `git` map the branch row reads. View-only:
// it never touches any dock's persisted `dashboard` visibility, and a rendered
// tab's click keeps its normal meaning. Unknown-branch tabs match neither
// branch-filtered state and render only under All. A non-All state that
// excludes tabs shows a +N chip (and speaks the count via the group label) so
// agents never vanish silently. Reorder mode suspends the filter — the full
// roster renders and the control disables — because placing relative to
// invisible neighbors would be ambiguous; the selection reapplies on exit.
// Like reorder state, the selection is view-local and resets on unmount/reload.
//
// Status state (openspec dock-strip-status-filters, merged by openspec
// dock-strip-filter-merge): the same control also offers `running`, a single
// "needs attention" view matching tabs whose DOT currently shows the running
// state OR the `!` unseen marker — the isRunning/isUnseen helpers below are
// the single source for both the dot and the filter, so they can never
// disagree. There is no separate `unseen` state. Status is live by nature:
// the /runs poll and roster refresh re-bucket tabs on the next tick, and
// clicking an unseen tab under `running` shows the dock, which clears the
// server latch — the tab STAYS rendered (now grid-visible, see below).
//
// Grid-visible exemption (openspec dock-strip-filter-merge): a tab whose dock
// currently renders in the grid (dashboard !== false) matches EVERY filter
// state — branch and status alike — so the strip is always a superset of
// what's on screen and filters only ever narrow hidden docks' tabs. The +N
// excluded count therefore only ever counts hidden docks.
const mainlike = (branch) => branch === 'main' || branch === 'master';

export default function DockToolbar({ tabs, live, git, onToggle, onReorder }) {
  const { t } = useT();
  const [reordering, setReordering] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'main' | 'feature' | 'running'
  if (!tabs.length) return null;

  const branchOf = (tab) => {
    const raw = git?.[tab.repoId]?.branch;
    return raw && raw !== 'unknown' ? raw : null;
  };
  // Dot classification, shared by the dot render AND the status filter states
  // so the filter matches exactly what the operator sees on the dot.
  const isRunning = (tab) => (live?.[tab.id]?.status || tab.status) === 'running';
  const isUnseen = (tab) => tab.dashboard === false && !isRunning(tab) && !!tab.unseenResult;
  const matchesFilter = (tab) => {
    if (filter === 'all') return true;
    // Grid-visible docks are exempt from every filter: the strip must stay a
    // superset of what the grid shows, so filters only narrow HIDDEN docks.
    if (tab.dashboard !== false) return true;
    if (filter === 'running') return isRunning(tab) || isUnseen(tab);
    const branch = branchOf(tab);
    if (!branch) return false; // unclassifiable: only the All state shows it
    return filter === 'main' ? mainlike(branch) : !mainlike(branch);
  };
  const visibleTabs = reordering ? tabs : tabs.filter(matchesFilter);
  const hiddenCount = tabs.length - visibleTabs.length;

  const toggleReordering = () => {
    setReordering((r) => !r);
    setPickedId(null); // leaving (or re-entering) the mode clears any pick
  };

  const handleTabClick = (tab, active) => {
    if (!reordering) {
      onToggle(tab.id, active);
      return;
    }
    // Reorder mode owns the click: pick, cancel, or place — never hide/show.
    if (!pickedId) {
      setPickedId(tab.id);
      return;
    }
    if (pickedId === tab.id) {
      setPickedId(null);
      return;
    }
    const ids = tabs.map((x) => x.id);
    const from = ids.indexOf(pickedId);
    const to = ids.indexOf(tab.id);
    setPickedId(null);
    if (from < 0 || to < 0) return; // picked tab closed meanwhile
    ids.splice(from, 1);
    // Insert at the target's ORIGINAL index: moving front-ward lands before
    // the target, moving back-ward lands after it (the removal shifted the
    // target left by one) — so the very front and very back are reachable.
    ids.splice(to, 0, pickedId);
    onReorder(ids);
  };

  return (
    <div className="dash__docktoolbar" role="tablist" aria-label={t('dashboard.dockToolbar')}>
      <span className="dash__docktoolbar-label">{t('dashboard.dockToolbar')}</span>
      <button
        type="button"
        className={`dash__dockreorder${reordering ? ' dash__dockreorder--on' : ''}`}
        aria-pressed={reordering}
        aria-label={t('dashboard.dockReorder')}
        title={t('dashboard.dockReorder')}
        onClick={toggleReordering}
      >
        ⇄
      </button>
      <span
        className="dash__dockfilter"
        role="group"
        aria-label={[
          t('dashboard.dockFilter'),
          hiddenCount > 0 ? t('dashboard.dockFilterHidden', { count: hiddenCount }) : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {[
          ['all', 'dashboard.dockFilterAll', null, null],
          ['main', 'dashboard.dockFilterMain', '⎇', null],
          ['feature', 'dashboard.dockFilterFeature', '⎇', null],
          // The visible label stays short ("running"); the title/aria-label
          // spells out that the state also matches unseen `!` results.
          ['running', 'dashboard.dockFilterRunning', '●', 'dashboard.dockFilterRunningTitle'],
        ].map(([state, key, glyph, titleKey]) => (
          <button
            key={state}
            type="button"
            className={`dash__dockfilter-btn${filter === state ? ' dash__dockfilter-btn--on' : ''}`}
            aria-pressed={filter === state}
            disabled={reordering}
            title={t(titleKey || key)}
            aria-label={t(titleKey || key)}
            onClick={() => setFilter(state)}
          >
            {glyph && <span aria-hidden="true">{glyph} </span>}
            {t(key)}
          </button>
        ))}
      </span>
      {visibleTabs.map((tab) => {
        const active = tab.dashboard !== false;
        const running = isRunning(tab);
        const unseen = isUnseen(tab);
        const branch = branchOf(tab);
        const picked = reordering && pickedId === tab.id;
        const base = reordering
          ? t(
              picked
                ? 'dashboard.dockReorderCancel'
                : pickedId
                  ? 'dashboard.dockReorderPlace'
                  : 'dashboard.dockReorderPick',
              { name: tab.repoName },
            )
          : unseen
            ? t('dashboard.dockToolbarUnseen', { name: tab.repoName })
            : t(active ? 'dashboard.dockToolbarHide' : 'dashboard.dockToolbarShow', {
                name: tab.repoName,
              });
        // Glyphs never carry the meaning alone: the star and branch row are
        // also spoken as label fragments.
        const label = [
          base,
          tab.important ? t('dashboard.dockToolbarImportant') : null,
          branch ? t('dashboard.dockToolbarBranch', { branch }) : null,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`dash__docktab${active ? ' dash__docktab--on' : ''}${
              picked ? ' dash__docktab--picked' : ''
            }`}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => handleTabClick(tab, active)}
          >
            <span
              className={`dash__docktab-dot${running ? ' dash__docktab-dot--running' : ''}${
                unseen ? ' dash__docktab-dot--unseen' : ''
              }`}
              style={!running && !unseen && tab.color ? { background: tab.color } : undefined}
              aria-hidden="true"
            >
              {unseen ? '!' : ''}
            </span>
            <span className="dash__docktab-text">
              <span className="dash__docktab-name">{tab.repoName}</span>
              {branch && (
                <span className="dash__docktab-branch">
                  <span aria-hidden="true">⎇</span> {branch}
                </span>
              )}
            </span>
            {tab.important && (
              <span className="dash__docktab-star" aria-hidden="true">
                ★
              </span>
            )}
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <span
          className="dash__dockfilter-count"
          title={t('dashboard.dockFilterHidden', { count: hiddenCount })}
          aria-hidden="true"
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
