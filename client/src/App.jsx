import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getPassword } from './api/client';
import PasswordGate from './components/PasswordGate';
import Landing from './pages/Landing';
import Layout from './layout/Layout';
import Chat from './pages/Chat';
import Files from './pages/Files';
import History from './pages/History';
import AppRun from './pages/AppRun';

// Two layers:
//   /        -- public landing: just the running product, no login, no chrome.
//   /studio  -- the Claude Web builder (Chat/Files/History/App), behind the
//               access code. The gate now wraps only this branch, not the whole
//               app, so a visitor reaches the product without ever logging in.
export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getPassword()));

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        {unlocked ? (
          <Route path="/studio" element={<Layout />}>
            <Route index element={<Chat />} />
            <Route path="files" element={<Files />} />
            <Route path="history" element={<History />} />
            <Route path="app" element={<AppRun />} />
          </Route>
        ) : (
          <Route path="/studio/*" element={<PasswordGate onUnlock={() => setUnlocked(true)} />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
