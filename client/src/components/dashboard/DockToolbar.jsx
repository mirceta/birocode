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
export default function DockToolbar({ tabs, live, onToggle }) {
  const { t } = useT();
  if (!tabs.length) return null;
  return (
    <div className="dash__docktoolbar" role="tablist" aria-label={t('dashboard.dockToolbar')}>
      <span className="dash__docktoolbar-label">{t('dashboard.dockToolbar')}</span>
      {tabs.map((tab) => {
        const active = tab.dashboard !== false;
        const running = (live?.[tab.id]?.status || tab.status) === 'running';
        const unseen = !active && !running && !!tab.unseenResult;
        const label = unseen
          ? t('dashboard.dockToolbarUnseen', { name: tab.repoName })
          : t(active ? 'dashboard.dockToolbarHide' : 'dashboard.dockToolbarShow', {
              name: tab.repoName,
            });
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`dash__docktab${active ? ' dash__docktab--on' : ''}`}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => onToggle(tab.id, active)}
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
            <span className="dash__docktab-name">{tab.repoName}</span>
          </button>
        );
      })}
    </div>
  );
}
