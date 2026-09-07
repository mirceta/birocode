import { useEffect, useMemo, useState } from 'react';
import { assignSlots, hueOf, machineKey, repoKey, readSlots, writeSlots } from './graphColors';

// The ONE shared machine/repo colour mapping (openspec taskgraph-colours), consumed by
// the Task graph, the Kanban board AND Fleet Status so the same machine/agent gets the
// same hue everywhere (fleet-status task 327aa5ae). It is the exact same palette + slot
// assignment + per-device persistence the Task graph already uses (SLOTS_KEY): a hue is
// assigned first-seen and kept, so every view that reads this map agrees, and a new view
// adopts already-assigned hues instead of inventing a second palette.
//
// Pass the machine keys and repo keys currently in view. The hook assigns any not-yet-seen
// ones, persists the merged map, and returns helpers keyed by the SAME machineKey/repoKey
// graphColors derives from a node/assignee — so callers never touch slot indices.
const DELIM = ''; // no repo/machine key contains this control char

export function useTaskColors(machineKeys, repoKeys) {
  const [slots, setSlots] = useState(() => readSlots(typeof localStorage === 'undefined' ? null : localStorage));

  // Stable string deps so the effect only runs when the SET of keys actually changes.
  const mDep = machineKeys.filter(Boolean).join(DELIM);
  const rDep = repoKeys.filter(Boolean).join(DELIM);

  useEffect(() => {
    const machines = assignSlots(machineKeys.filter(Boolean), slots.machines);
    const repos = assignSlots(repoKeys.filter(Boolean), slots.repos);
    if (JSON.stringify(machines) !== JSON.stringify(slots.machines)
      || JSON.stringify(repos) !== JSON.stringify(slots.repos)) {
      const next = { machines, repos };
      writeSlots(typeof localStorage === 'undefined' ? null : localStorage, next);
      setSlots(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mDep, rDep]);

  return useMemo(() => {
    const machineHue = (mk) => (mk != null && slots.machines[mk] != null ? hueOf(slots.machines[mk]) : null);
    const repoHue = (rk) => (rk != null && slots.repos[rk] != null ? hueOf(slots.repos[rk]) : null);
    // CSS custom props + presence classes for a chip coloured like a task-graph node
    // (border = machine hue via --tg-machine-h, background = repo tint via --tg-repo-h).
    const chip = (mk, rk) => {
      const mh = machineHue(mk);
      const rh = repoHue(rk);
      const style = {};
      if (mh != null) style['--tg-machine-h'] = String(mh);
      if (rh != null) style['--tg-repo-h'] = String(rh);
      const cls = `${mh != null ? ' has-machine' : ''}${rh != null ? ' has-repo' : ''}`;
      return { style, cls };
    };
    return { slots, machineHue, repoHue, chip };
  }, [slots]);
}

// Re-export the key derivations so callers import one module for the shared scheme.
export { machineKey, repoKey };
