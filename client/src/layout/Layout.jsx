import { Outlet } from 'react-router-dom';
import SaveButton from '../components/shared/SaveButton';
import { SaveProvider } from '../components/history/SaveHandler';
import BottomNav from './BottomNav';

// App frame shared by every page: a sticky header with the title and the
// always-visible Save button, a scrollable content area where the active
// page renders via <Outlet/>, and a fixed bottom navigation bar.
//
// M7 integration: the whole shell is wrapped in <SaveProvider> so the header
// Save button and the History page share one save flow (modal + toast +
// refresh signal) via useSave().
export default function Layout() {
  return (
    <SaveProvider>
      <div className="app-shell">
        <div className="app-frame">
          <header className="app-header">
            <h1 className="app-header__title">Claude Web</h1>
            <SaveButton />
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
