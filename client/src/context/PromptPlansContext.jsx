import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';

// User-defined prompt PLANS (plans/prompt-plans.md) — named, ordered prompt-step
// sequences. The sibling of PromptsContext: GLOBAL + backend-synced
// (/api/prompt-plans), shared by every chat composer, so we fetch once here. A
// plan is { id, name, steps: [{ name, details, expected }] }; step order is the
// send sequence, so create/edit always sends the WHOLE step array.
const PromptPlansContext = createContext(null);

export function usePromptPlans() {
  const ctx = useContext(PromptPlansContext);
  if (!ctx) throw new Error('usePromptPlans must be used within a <PromptPlansProvider>');
  return ctx;
}

export function PromptPlansProvider({ children }) {
  const [plans, setPlans] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await apiGet('/prompt-plans');
      if (Array.isArray(list)) setPlans(list);
    } catch {
      /* leave the current list; the manager surfaces write errors itself */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addPlan = useCallback(async (name, steps) => {
    const p = await apiPost('/prompt-plans', { name, steps });
    setPlans((cur) => [...cur, p]);
    return p;
  }, []);

  const updatePlan = useCallback(async (id, name, steps) => {
    const p = await apiPatch(`/prompt-plans/${id}`, { name, steps });
    setPlans((cur) => cur.map((x) => (x.id === id ? p : x)));
    return p;
  }, []);

  const deletePlan = useCallback(async (id) => {
    await apiDelete(`/prompt-plans/${id}`);
    setPlans((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const value = { plans, refresh, addPlan, updatePlan, deletePlan };
  return <PromptPlansContext.Provider value={value}>{children}</PromptPlansContext.Provider>;
}
