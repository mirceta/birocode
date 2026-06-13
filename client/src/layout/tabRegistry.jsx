import { useLocation } from 'react-router-dom';
import { getLastClaudeView } from '../components/shared/ClaudeViewToggle';
import { FEATURES, useUiMode } from '../context/UiModeContext';
import { useUiSettings } from '../context/UiSettingsContext';
import Chat from '../pages/Chat';
import Files from '../pages/Files';
import History from '../pages/History';
import AppRun from '../pages/AppRun';
import LocalApp from '../pages/LocalApp';
import Ideas from '../pages/Ideas';
import Agents from '../pages/Agents';
import Git from '../pages/Git';
import Plan from '../pages/Plan';
import Screen from '../pages/Screen';
import Terminal from '../pages/Terminal';
import Projects from '../pages/Projects';
import Guests from '../pages/Guests';
import Settings from '../pages/Settings';

// THE canonical tab list (plans/settings-tab.md). BottomNav, PaneStrip and
// the Settings reorder UI all consume useOrderedTabs() — the old "keep
// BottomNav and PaneStrip in sync" comment pair is dead. Order of this
// array is the DEFAULT order; the user's saved order (backend-synced)
// rearranges it. Keys here mirror SettingsController.KnownTabs.
const STATIC_TABS = [
  { key: 'files', path: '/studio/files', labelKey: 'nav.files', icon: 'F', feature: null, element: <Files /> },
  { key: 'plan', path: '/studio/plan', labelKey: 'nav.plan', icon: '☰', feature: 'planTab', element: <Plan /> },
  { key: 'git', path: '/studio/git', labelKey: 'nav.git', icon: '⎇', feature: 'gitTab', element: <Git /> },
  { key: 'history', path: '/studio/history', labelKey: 'nav.history', icon: 'H', feature: null, element: <History /> },
  { key: 'agents', path: '/studio/agents', labelKey: 'nav.agents', icon: 'A', feature: 'agentDock', element: <Agents /> },
  { key: 'screen', path: '/studio/screen', labelKey: 'nav.screen', icon: 'S', feature: 'screenTab', element: <Screen /> },
  { key: 'projects', path: '/studio/projects', labelKey: 'nav.projects', icon: 'P', feature: 'projectsTab', element: <Projects /> },
  { key: 'guests', path: '/studio/guests', labelKey: 'nav.guests', icon: '⛨', feature: 'guestsTab', element: <Guests /> },
  { key: 'app', path: '/studio/app', labelKey: 'nav.app', icon: '▶', feature: 'appTab', element: <AppRun /> },
  { key: 'localapp', path: '/studio/local', labelKey: 'nav.localApp', icon: '⌂', feature: 'localAppTab', element: <LocalApp /> },
  { key: 'ideas', path: '/studio/ideas', labelKey: 'nav.ideas', icon: '💡', feature: 'ideasTab', element: <Ideas /> },
  { key: 'settings', path: '/studio/settings', labelKey: 'nav.settings', icon: '⚙', feature: 'settingsTab', element: <Settings /> },
];

/// Visible tabs in the user's order. The Chat/Term pair is ONE 'claude'
/// entry whose face follows the route / last-used view
/// (plans/terminal-sessions.md); it moves as one unit when reordered.
///
/// `includeHidden` (Settings only, plans/tab-visibility.md): keep tabs the
/// user has hidden and annotate each `{ hidden }`, so the Settings toggle UI
/// can list them. Every other consumer (BottomNav, PaneStrip, active-tab)
/// calls with the default and gets the hidden tabs filtered out.
export function useOrderedTabs({ includeHidden = false } = {}) {
  const { uiMode } = useUiMode();
  const { tabOrder, hiddenTabs } = useUiSettings();
  const { pathname } = useLocation();
  const isAdvanced = uiMode === 'advanced';
  const visible = (feature) => !feature || FEATURES[feature] === 'basic' || isAdvanced;
  // Hiding is an advanced-mode preference; Basic mode ignores the set.
  const hidden = new Set(isAdvanced ? hiddenTabs : []);

  const path = pathname.replace(/\/+$/, '') || '/studio';
  const termView = visible('terminalTab')
    && (path === '/studio/terminal' || (path !== '/studio' && getLastClaudeView() === 'term'));
  const claude = {
    key: 'claude',
    path: termView ? '/studio/terminal' : '/studio',
    labelKey: termView ? 'nav.terminal' : 'nav.chat',
    icon: termView ? '>_' : 'C',
    feature: null,
    element: termView ? <Terminal /> : <Chat />,
    end: true,
    forceActive: path === '/studio' || path === '/studio/terminal',
  };

  const tabs = [claude, ...STATIC_TABS.filter((t) => visible(t.feature))]
    .map((t) => ({ ...t, advancedOnly: !!t.feature && FEATURES[t.feature] !== 'basic', hidden: hidden.has(t.key) }))
    .filter((t) => includeHidden || !t.hidden);

  // Saved order first (by its index); tabs it doesn't mention follow in
  // default order — new tabs ship without migrations.
  const idx = new Map(tabOrder.map((k, i) => [k, i]));
  return tabs
    .map((t, i) => ({ t, sort: idx.has(t.key) ? idx.get(t.key) : 1000 + i }))
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.t);
}
