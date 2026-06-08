import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getPassword } from './api/client';
import PasswordGate from './components/PasswordGate';
import Layout from './layout/Layout';
import Chat from './pages/Chat';
import Files from './pages/Files';
import History from './pages/History';
import AppRun from './pages/AppRun';

// App root. Before the shell mounts we require an access code so that every
// /api call has a password to attach (see api/client.js). The gate is the
// only auth UI in the app.
export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getPassword()));

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Chat />} />
          <Route path="files" element={<Files />} />
          <Route path="history" element={<History />} />
          <Route path="app" element={<AppRun />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
