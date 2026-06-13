import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { apiGet } from './api/client';
import PasswordGate from './components/PasswordGate';
import Loading from './components/shared/Loading';
import Landing from './pages/Landing';
import Layout from './layout/Layout';
import Chat from './pages/Chat';
import Files from './pages/Files';
import History from './pages/History';
import AppRun from './pages/AppRun';
import LocalApp from './pages/LocalApp';
import Ideas from './pages/Ideas';
import Deployments from './pages/Deployments';
import Agents from './pages/Agents';
import Git from './pages/Git';
import Plan from './pages/Plan';
import Screen from './pages/Screen';
import Terminal from './pages/Terminal';
import Projects from './pages/Projects';
import Guests from './pages/Guests';
import Settings from './pages/Settings';

// Two layers:
//   /        -- public landing: just the running product, no login, no chrome.
//   /studio  -- the Claude Web builder (Chat/Files/History/App), behind the
//               session login (plans/auth-login.md). The gate wraps only this
//               branch, so a visitor reaches the product without logging in.
export default function App() {
  // 'unknown' until GET /api/auth/check answers; the session lives in an
  // HttpOnly cookie, so the server is the only one who knows.
  const [auth, setAuth] = useState('unknown');
  const unlocked = auth === 'in';

  useEffect(() => {
    apiGet('/auth/check')
      .then((r) => setAuth(r.authenticated ? 'in' : 'out'))
      .catch(() => setAuth('out'));
  }, []);

  if (auth === 'unknown') return <Loading />;

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
            <Route path="local" element={<LocalApp />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="deploys" element={<Deployments />} />
            <Route path="agents" element={<Agents />} />
            <Route path="git" element={<Git />} />
            <Route path="plan" element={<Plan />} />
            <Route path="screen" element={<Screen />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="projects" element={<Projects />} />
            <Route path="guests" element={<Guests />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        ) : (
          <Route path="/studio/*" element={<PasswordGate onUnlock={() => setAuth('in')} />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
