import { useT } from '../../i18n/LanguageContext';

// Dashboard dock toolbar (openspec add-dashboard-dock-toolbar): a horizontal,
// overflow-scrolling strip listing EVERY dock in the roster — including ones
// currently hidden from the grid — as a toggleable tab. A tab is "active" when
// its dock renders in the grid (dashboard !== false); clicking it flips the
// dock's existing `dashboard` visibility field (via the parent's updateTab), so
// hiding/showing here stays in sync with the Agents-page ▦ toggle. No local
// duplicate state: the tabs re-derive from the same dock roster the grid reads.
export default function DockToolbar({ tabs, onToggle }) {
  const { t } = useT();
  if (!tabs.length) return null;
  return (
    <div className="dash__docktoolbar" role="tablist" aria-label={t('dashboard.dockToolbar')}>
      <span className="dash__docktoolbar-label">{t('dashboard.dockToolbar')}</span>
      {tabs.map((tab) => {
        const active = tab.dashboard !== false;
        const label = t(active ? 'dashboard.dockToolbarHide' : 'dashboard.dockToolbarShow', {
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
              className="dash__docktab-dot"
              style={tab.color ? { background: tab.color } : undefined}
              aria-hidden="true"
            />
            <span className="dash__docktab-name">{tab.repoName}</span>
          </button>
        );
      })}
    </div>
  );
}
