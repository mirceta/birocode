// The Management App entry (openspec management-app): a second Vite build of the
// same React code, output to events-app/manage/ and served by the harness as a
// build-less static folder at /api/localview/<repo>/app/events-feed/manage/.
// Same origin as the harness, so the session cookie authorizes every /api call
// and a rebuild + refresh is all it takes — no harness redeploy.
//
// Providers: the same nesting Layout.jsx uses for the pieces we lift — UiMode
// (pinned to advanced: management is an Advanced surface by definition), Repo
// (DockProvider reads it), Dock (the Arch page reads it), and a MemoryRouter for
// the page's useNavigate. Nothing chat-, prompt- or flags-related is mounted.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../i18n/LanguageContext';
import { UiModeProvider } from '../context/UiModeContext';
import { RepoProvider } from '../context/RepoContext';
import { DockProvider } from '../context/DockContext';
import ManageApp from './ManageApp.jsx';
import '../styles/global.css';

try {
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
} catch {
  /* private mode: UiModeProvider falls back to basic; ManageApp shows a hint */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <UiModeProvider>
        <RepoProvider>
          <DockProvider>
            <MemoryRouter>
              <ManageApp />
            </MemoryRouter>
          </DockProvider>
        </RepoProvider>
      </UiModeProvider>
    </LanguageProvider>
  </React.StrictMode>
);
