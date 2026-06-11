import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import SaveButton from '../components/shared/SaveButton';
import LanguageToggle from '../components/shared/LanguageToggle';
import ModeToggle from '../components/shared/ModeToggle';
import ProjectChip from '../components/shared/ProjectChip';
import { SaveProvider } from '../components/history/SaveHandler';
import { ChatProvider } from '../context/ChatContext';
import { RepoProvider } from '../context/RepoContext';
import { DockProvider } from '../context/DockContext';
import { UiModeProvider, useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import BottomNav from './BottomNav';

// The build stamp is an Operator debugging aid — Advanced Mode only.
function BuildStamp() {
  if (!useFeature('buildStamp')) return null;
  return (
    <span className="build-stamp">
      {new Date(__BUILD_TIME__).toLocaleString()}
    </span>
  );
}

export default function Layout() {
  const { t } = useT();
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);
  return (
    <UiModeProvider>
      <RepoProvider>
        <DockProvider>
          <SaveProvider>
            <ChatProvider>
              <div className="app-shell">
                <div className="app-frame">
                  <header className="app-header">
                    <h1 className="app-header__title">{t('app.title')}</h1>
                    <div className="app-header__actions">
                      <ProjectChip />
                      <LanguageToggle />
                      <SaveButton />
                      <ModeToggle />
                    </div>
                  </header>

                  <main className="app-content">
                    <Outlet />
                  </main>

                  <BottomNav />
                  <BuildStamp />
                </div>
              </div>
            </ChatProvider>
          </SaveProvider>
        </DockProvider>
      </RepoProvider>
    </UiModeProvider>
  );
}
