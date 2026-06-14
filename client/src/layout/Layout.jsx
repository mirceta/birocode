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
import { DockProvider } from '../context/DockContext';
import { UiModeProvider, useFeature } from '../context/UiModeContext';
import { UiSettingsProvider } from '../context/UiSettingsContext';
import { useT } from '../i18n/LanguageContext';
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
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);
  return (
    <div className="app-shell">
      <div className={`app-frame${multi ? ' app-frame--multi' : ''}`}>
        <StaleVersionBanner />
        <header className="app-header">
          <HeaderTitle />
          <div className="app-header__actions">
            <HelloButton />
            <ProjectChip />
            <LanguageToggle />
            <SaveButton />
            <ModeToggle />
          </div>
        </header>

        {multi ? (
          <PaneStrip panes={panes} activeKey={activeKey} />
        ) : (
          <main className="app-content">
            <Outlet />
          </main>
        )}

        <BottomNav />
        <BuildStamp />
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <UiModeProvider>
      <RepoProvider>
        <UiSettingsProvider>
          <DockProvider>
            <SaveProvider>
              <ChatProvider>
                <StudioShell />
              </ChatProvider>
            </SaveProvider>
          </DockProvider>
        </UiSettingsProvider>
      </RepoProvider>
    </UiModeProvider>
  );
}
