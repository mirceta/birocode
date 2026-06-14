import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { apiGet } from '../api/client';
import SaveButton from '../components/shared/SaveButton';
import LanguageToggle from '../components/shared/LanguageToggle';
import ModeToggle from '../components/shared/ModeToggle';
import ProjectChip from '../components/shared/ProjectChip';
import StaleVersionBanner from '../components/shared/StaleVersionBanner';
import { SaveProvider } from '../components/history/SaveHandler';
import { ChatProvider } from '../context/ChatContext';
import { RepoProvider, useRepo } from '../context/RepoContext';
import { DockProvider, useDock } from '../context/DockContext';
import { PromptsProvider } from '../context/PromptsContext';
import { UiModeProvider, useFeature } from '../context/UiModeContext';
import { UiSettingsProvider } from '../context/UiSettingsContext';
import { useT } from '../i18n/LanguageContext';
import Dashboard from '../pages/Dashboard';
import BottomNav from './BottomNav';
import PaneStrip, { useMultiPane } from './PaneStrip';

// Header title: in Advanced Mode shows "machine · project · branch" so the
// Operator always sees which host/repo/branch they are driving; Basic Mode
// keeps the friendly app title.
function HeaderTitle() {
  const { t } = useT();
  const show = useFeature('machineName');
  const { current } = useRepo();
  const [machineName, setMachineName] = useState(null);
  const [branch, setBranch] = useState(null);

  useEffect(() => {
    if (!show) return;
    apiGet('/health')
      .then((h) => setMachineName(h.machineName || null))
      .catch(() => setMachineName(null));
  }, [show]);

  useEffect(() => {
    if (!show || !current) {
      setBranch(null);
      return;
    }
    apiGet('/branch', { repoId: current.id })
      .then((b) => setBranch(b.branch || null))
      .catch(() => setBranch(null));
  }, [show, current]);

  if (!show || !machineName) {
    return <h1 className="app-header__title">{t('app.title')}</h1>;
  }
  const parts = [machineName, current?.name, branch].filter(Boolean);
  return <h1 className="app-header__title">{parts.join(' · ')}</h1>;
}

// HELLO button (user request 2026-06-12, no plan file — flagged): inert,
// Advanced-only, text deliberately not i18n'd.
function HelloButton() {
  if (!useFeature('helloButton')) return null;
  return <button type="button" className="hello-btn">HELLO</button>;
}

// Top-bar entry point for the agent dashboard (plans/agent-dashboard.md). The
// dashboard is a full-screen overview, not a tab — it only earns a button when
// there is more than one agent to compare. Advanced-gated via 'agentDashboard'.
function DashboardButton({ open, onToggle }) {
  const { t } = useT();
  const enabled = useFeature('agentDashboard');
  const { tabs } = useDock();
  if (!enabled || tabs.length < 2) return null;
  return (
    <button
      type="button"
      className={`dash-btn${open ? ' dash-btn--active' : ''}`}
      onClick={onToggle}
      aria-pressed={open}
      title={t('dashboard.shortcutHint')}
    >
      {t('dashboard.open')}
    </button>
  );
}

// The build stamp is an Operator debugging aid — Advanced Mode only.
function BuildStamp() {
  if (!useFeature('buildStamp')) return null;
  return (
    <span className="build-stamp">
      {new Date(__BUILD_TIME__).toLocaleString()}
    </span>
  );
}

// Inner shell so it can use the provider hooks (UiMode for multi-pane).
// On a wide Advanced-mode window the content area becomes a pane strip
// (plans/multi-pane.md); otherwise the classic single-page Outlet.
function StudioShell() {
  const { t } = useT();
  const { multi, panes, activeKey } = useMultiPane();
  const dashEnabled = useFeature('agentDashboard');
  const [dashOpen, setDashOpen] = useState(false);
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);
  // Keyboard: Ctrl/Cmd+Shift+D toggles the dashboard overlay <-> tab view
  // (plans/dashboard-shortcut.md); Escape closes it. Ignored while typing so it
  // never fires mid-message; preventDefault so it wins over any browser binding.
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = /^(input|textarea|select)$/i.test(el?.tagName || '') || el?.isContentEditable;
      if (dashEnabled && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey
          && (e.key === 'd' || e.key === 'D') && !typing) {
        e.preventDefault();
        setDashOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && dashOpen) setDashOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dashEnabled, dashOpen]);
  return (
    <div className="app-shell">
      <div className={`app-frame${multi ? ' app-frame--multi' : ''}`}>
        <StaleVersionBanner />
        <header className="app-header">
          <HeaderTitle />
          <div className="app-header__actions">
            <HelloButton />
            <DashboardButton open={dashOpen} onToggle={() => setDashOpen((o) => !o)} />
            <ProjectChip />
            <LanguageToggle />
            <SaveButton />
            <ModeToggle />
          </div>
        </header>

        {dashOpen ? (
          // Full-screen overview: replaces the content area and hides the
          // bottom nav / pane strip (plans/agent-dashboard.md). Top bar stays
          // visible so the same button (or Escape, or the in-overlay ×) closes.
          <main className="app-content">
            <Dashboard onClose={() => setDashOpen(false)} />
          </main>
        ) : multi ? (
          <PaneStrip panes={panes} activeKey={activeKey} />
        ) : (
          <main className="app-content">
            <Outlet />
          </main>
        )}

        {!dashOpen && <BottomNav />}
        <BuildStamp />
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <UiModeProvider>
      <UiSettingsProvider>
        <RepoProvider>
          <DockProvider>
            <SaveProvider>
              <ChatProvider>
                <PromptsProvider>
                  <StudioShell />
                </PromptsProvider>
              </ChatProvider>
            </SaveProvider>
          </DockProvider>
        </RepoProvider>
      </UiSettingsProvider>
    </UiModeProvider>
  );
}
