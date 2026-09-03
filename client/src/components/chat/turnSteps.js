// Pure reducers for an assistant turn's activity trail (thinking blocks + tool
// calls), fed by the CLI run's stream events. ChatContext applies them to the
// active conversation's last assistant bubble; the Arch tab applies them to
// its live arch turn — same events, same steps shape, so <ActivitySteps>
// renders both identically.

// A 'thinking' event: extend the trailing thinking block, or open a new one.
export function appendThinking(steps, text) {
  const next = (steps || []).slice();
  const last = next[next.length - 1];
  if (last && last.kind === 'thinking') {
    next[next.length - 1] = { ...last, text: last.text + (text || '') };
  } else {
    next.push({ kind: 'thinking', text: text || '' });
  }
  return next;
}

// A 'tool' event: start/input opens or enriches the step with that id; end
// settles it (falling back to the newest running step when the id is unknown).
export function applyToolEvent(steps, evt) {
  const next = (steps || []).slice();
  let idx = evt.id ? next.findIndex((s) => s.kind === 'tool' && s.id === evt.id) : -1;

  if (evt.status === 'start' || evt.status === 'input') {
    if (idx === -1) {
      next.push({
        kind: 'tool', id: evt.id, name: evt.name || 'tool',
        status: 'running', startedAt: Date.now(),
        summary: evt.summary || '', detail: evt.detail || '', preview: '',
      });
    } else {
      next[idx] = {
        ...next[idx],
        name: evt.name || next[idx].name,
        summary: evt.summary ?? next[idx].summary,
        detail: evt.detail ?? next[idx].detail,
      };
    }
  } else if (evt.status === 'end') {
    if (idx === -1) {
      for (let j = next.length - 1; j >= 0; j--) {
        if (next[j].kind === 'tool' && next[j].status === 'running') { idx = j; break; }
      }
    }
    if (idx !== -1) {
      next[idx] = {
        ...next[idx], status: evt.ok === false ? 'error' : 'done',
        ok: evt.ok !== false, preview: evt.preview || '',
      };
    }
  }
  return next;
}

// End of stream: any step still "running" is settled as done.
export function settleSteps(steps) {
  if (!steps?.some((s) => s.kind === 'tool' && s.status === 'running')) return steps;
  return steps.map((s) => (s.kind === 'tool' && s.status === 'running' ? { ...s, status: 'done' } : s));
}
