import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import HarnessLauncher from './manage/HarnessLauncher.jsx';
import { isHostPage } from './components/shared/harnessHost';
import { LanguageProvider } from './i18n/LanguageContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      {/* The harness host tab (openspec harness-tabs-left-window): a studio page opening an agent creates it here. */}
      {isHostPage() ? <HarnessLauncher /> : <App />}
    </LanguageProvider>
  </React.StrictMode>
);
