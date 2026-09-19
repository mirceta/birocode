// Fixture for shot-dock-tools-harness.mjs (openspec repo-agent-harness-tools): the dock's
// Tools lane mounted on its own, over a mocked /api/tools, so the harness block can be
// asserted in a real browser without the whole dashboard.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { LanguageProvider } from '../../../src/i18n/LanguageContext';
import ToolsPanel from '../../../src/components/dashboard/ToolsPanel';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ToolsPanel repoId="r-prg" />
    </LanguageProvider>
  </React.StrictMode>
);
