// The arch agent's on/off, in words (openspec arch-arm-control). Pure; node-tested.
// GET /api/arch/armed → { armed, holders: [{ conversation, name, kind, mode, iterations, cap, goal }],
//   last: { name, conversationExists, kind, status, reason, detail, at, why }, gateOpen, managedCount,
//   armBlocked, standingConversation }

export function agoWords(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** One holder line: "standing wake loop on “Standing loop” (drive, no cap, 12 wakes)". */
export function holderLine(h) {
  if (!h) return '';
  if (h.kind === 'arch') return `the standing wake loop on “${h.name}” (${h.mode}, ${h.cap ? `cap ${h.cap}` : 'no cap'}, ${h.iterations} wake${h.iterations === 1 ? '' : 's'})`;
  const what = h.kind === 'goal' ? `goal${h.goal ? ` “${h.goal.length > 60 ? `${h.goal.slice(0, 57)}…` : h.goal}”` : ''}` : `${h.kind} loop`;
  return `${what} on “${h.name}” (${h.iterations}/${h.cap || '∞'}) — only while it runs`;
}

/** The whole bar's content (pure). */
export function armView(s, now = Date.now()) {
  if (!s) return { tone: 'loading', title: 'Arch agent: checking…', lines: [], action: null };
  if (s.armed) {
    return {
      tone: 'on',
      title: 'Arch agent is ON — it can send tasks to repo agents',
      lines: s.holders.map((h) => `Kept on by ${holderLine(h)}`),
      action: { label: '■ Turn the arch off', armed: false, confirm: s.holders.length > 1 || s.holders.some((h) => h.kind !== 'arch') ? `Turn the arch off? This stops ${s.holders.length} running loop${s.holders.length === 1 ? '' : 's'}:\n${s.holders.map((h) => `• ${holderLine(h)}`).join('\n')}` : null },
    };
  }
  const lines = [];
  if (s.last) lines.push(`Why: ${s.last.why} (${agoWords(s.last.at, now)})`);
  else lines.push('It has never been turned on.');
  // The standing loop is what keeps the arch on between goals — say what happened to it too.
  const st = s.lastStanding;
  if (st && (!s.last || st.conversation !== s.last.conversation || st.at !== s.last.at)) lines.push(`Standing wake loop: ${st.why.replace(/^the standing wake loop /, '')} (${agoWords(st.at, now)})`);
  else if (!st && s.last && s.last.kind !== 'arch') lines.push('Standing wake loop: never turned on — goals kept the arch on only while they ran');
  if (s.armBlocked) lines.push(`Cannot turn on yet: ${s.armBlocked}`);
  return {
    tone: 'off',
    title: 'Arch agent is OFF — it cannot send tasks to repo agents',
    lines,
    action: { label: '▶ Turn the arch on', armed: true, disabled: !!s.armBlocked, confirm: null },
  };
}

/** The rules, as a table (rows of [turns it on, turns it off]). */
export const ARM_RULES = [
  ['▶ Turn the arch on (here) — a standing wake loop, no cap, until you turn it off', '■ Turn the arch off (here) — stops every running arch loop'],
  ['Starting a goal — on only while that goal runs', 'The goal finishing, being stopped, or reaching its cap'],
  ['', 'Deleting the conversation that holds the loop'],
  ['', 'The standing loop reaching a cap you set on it'],
];
