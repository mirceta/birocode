import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import SaveButton from '../components/shared/SaveButton';
import LanguageToggle from '../components/shared/LanguageToggle';
import { SaveProvider } from '../components/history/SaveHandler';
import { useT } from '../i18n/LanguageContext';
import BottomNav from './BottomNav';

export default function Layout() {
  const { t } = useT();
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);
  return (
    <SaveProvider>
      <div className="app-shell">
        <div className="app-frame">
          <header className="app-header">
            <h1 className="app-header__title">{t('app.title')}</h1>
            <div className="app-header__actions">
              <LanguageToggle />
              <SaveButton />
            </div>
          </header>

          <main className="app-content">
            <Outlet />
          </main>

          <BottomNav />
        </div>
      </div>
    </SaveProvider>
  );
}
