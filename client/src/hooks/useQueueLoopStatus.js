import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';

// Queue-armed strip marking on the MAIN chat page (openspec:
// queue-loop-visibility, D2). The dashboard already polls the ungated
// /api/autopilot/loops projection and hands each dock its loop; the main Chat
// page polls nothing loop-shaped, so this hook fills the gap — a ~10s
// visible-page poll, enabled ONLY while there is something to mark (an active
// agent tab with a non-empty stash), so it idles exactly when the strip has no
// chips. Returns the repo's loop projection row (or null); the strip itself
// decides whether it marks (kind/active/queueTabId checks live in ChatInput).
export default function useQueueLoopStatus({ enabled, repoId }) {
  const [loop, setLoop] = useState(null);

  useEffect(() => {
    if (!enabled || !repoId) {
      setLoop(null);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      try {
        const info = await apiGet('/autopilot/loops');
        if (!alive) return;
        setLoop((info?.loops || []).find((l) => l.repoId === repoId) || null);
      } catch {
        /* keep the last known state; the next tick retries */
      }
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, repoId]);

  return loop;
}
