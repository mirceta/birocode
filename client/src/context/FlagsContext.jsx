import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useFeature } from './UiModeContext';

const POLL_MS = 15000;
const EMPTY = { enabled: true, flags: [], dismissed: [] };
const FlagsContext = createContext(null);

// Shared agent-flags state (docs/loop-driven-agent-convention.md, "Non-blocking
// flags"): ONE poll of /api/flags feeds every surface — the footer strip and the
// per-dock ⚑ badges — so a dashboard full of cards never multiplies the polling.
// Every mutation (dismiss, channel toggle) returns the full payload, so all
// surfaces reconcile in one round trip. Polls only while some flags surface is
// enabled (both are Advanced-gated) and the tab is visible.
export function FlagsProvider({ children }) {
  const footerOn = useFeature('flagsFooter');
  const badgeOn = useFeature('flagsDockBadge');
  const anySurface = footerOn || badgeOn;
  const [data, setData] = useState(EMPTY);

  const refresh = useCallback(() => {
    if (document.hidden) return;
    apiGet('/flags').then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!anySurface) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [anySurface, refresh]);

  const dismiss = useCallback((id) => {
    apiPost(`/flags/${id}/dismiss`, {}).then(setData).catch(() => refresh());
  }, [refresh]);

  const value = useMemo(() => ({
    enabled: data.enabled !== false,
    flags: data.flags || [],
    dismissed: data.dismissed || [],
    dismiss,
    refresh,
  }), [data, dismiss, refresh]);

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFlags() {
  return useContext(FlagsContext);
}
