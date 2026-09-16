// Kanban card SECTIONS (openspec kanban-card-sections): the pure rules behind a card that
// explains itself instead of a row of cryptic badges. Framework-free (node --test), like
// kanbanColumns.js / kanbanLayout.js.
//
//   Header      — #ref · title · assignees                       (rendered by the board)
//   Progress    — the lifecycle as steps, the current one lit     progressOf()
//   Board check — ONE plain-English status that always names WHO set it and WHEN:
//                 ✅ Honest · ⚠️ Not verified yet · 🆘 Needs human · 🔧 Manual · 👤 External owner
//                                                                  boardCheckOf()
//   Owner       — only when a DIFFERENT human developer owns the card (openspec
//                 kanban-external-owner): who, since when, and that it is out of our domain
//                                                                  ownerOf()
//   Legs        — a cross-repo EFFORT (openspec cross-repo-effort-legs): every typed leg
//                 (driver / driven, agentless checkouts) with its own PR + verified merge,
//                 "N of M legs merged", PARTIALLY merged named — never done off one leg
//                                                                  legsOf()
//   Links       — branch · PR · verified state · pings · deps, collapsed by default
//                                                                  linksOf()
//
// Rules: never a raw reason string from the verifier or the policeman on the card — every
// reason is rewritten in words; every status carries its source (the auto-verifier's git &
// PR facts, the policeman, the agent, or you) so "who put that there" is always answerable.
import { STATUS_KEYS } from './kanbanColumns.js';

export const STEPS = [
  ['todo', 'To do'],
  ['doing', 'Doing'],
  ['committed', 'Committed'],
  ['pr-opened', 'PR open'],
  ['pr-merged', 'Merged'],
  ['done', 'Done'],
];
const LABEL = Object.fromEntries(STEPS);
const rank = (s) => Math.max(0, STATUS_KEYS.indexOf(s || 'todo'));

/** The sources a status can come from, and how the card names them. */
export const SOURCES = {
  'auto-verifier': 'the auto-verifier (git & PR facts)',
  // The Board check's own actor tag on a flag (openspec board-check-provenance) reads as the auto-verifier.
  'board-check': 'the auto-verifier (git & PR facts)',
  policeman: 'the policeman',
  agent: 'the agent',
  operator: 'you (operator)',
};
export const sourceLabel = (s) => SOURCES[s] || SOURCES['auto-verifier'];

export function ago(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** "Says more than the harness has verified": status above max(doing, verifiedStatus) —
 * the same rule as TaskLifecycle.IsUnverified on the server. */
export function isUnverified(status, verifiedStatus) {
  return rank(status) > Math.max(rank('doing'), rank(verifiedStatus));
}

// ---- Progress ---------------------------------------------------------------------------

/** The lifecycle as steps. state ∈ done | current | current-unverified | todo. */
export function progressOf(node) {
  const current = STATUS_KEYS.includes(node?.status) ? node.status : 'todo';
  const cur = rank(current);
  const unverified = isUnverified(current, node?.verifiedStatus);
  const steps = STEPS.map(([key, label], i) => ({
    key,
    label,
    state: i < cur ? 'done' : i === cur ? (unverified ? 'current-unverified' : 'current') : 'todo',
  }));
  return { current, currentLabel: LABEL[current], steps, unverified };
}

/** The one-line note under the steps: where the work stands with the assignee. */
export function progressNote(node, { blockedBy = [], now = Date.now() } = {}) {
  if (blockedBy.length > 0) return `blocked — waits on ${blockedBy.join(', ')}`;
  if (!node?.repoId) return 'not assigned';
  if (node.dispatchedAt) return `pinged ${ago(now - node.dispatchedAt)} ago${node.dispatchCount > 1 ? ` (×${node.dispatchCount})` : ''}`;
  if (node.status === 'todo' && node.assignedAt) return 'assigned — waiting for the arch to ping the assignee';
  if (node.status === 'todo' && !node.assignedAt) return 'repo label only — re-assign to make it a real assignment';
  return '';
}

// ---- Board check -------------------------------------------------------------------------

/** The plain-English reason a card is not verified yet (never the verifier's raw string). */
export function plainUnverifiedReason(node) {
  const claimed = LABEL[node?.status] || node?.status || 'this';
  const verified = node?.verifiedStatus ? LABEL[node.verifiedStatus] || node.verifiedStatus : null;
  switch (node?.status) {
    case 'committed':
      if (node.pushed === false) return 'marked Committed, but the branch is not pushed to origin yet';
      return verified && rank(node.verifiedStatus) >= rank('committed')
        ? `marked Committed and ${verified} is confirmed`
        : 'marked Committed, but no commits on a branch have been seen yet';
    case 'pr-opened':
      return 'marked PR open, but no pull request has been found on GitHub yet';
    case 'pr-merged':
      return 'marked Merged, but GitHub does not show a merged pull request yet';
    case 'done':
      return rank(node.verifiedStatus) >= rank('pr-merged')
        ? 'marked Done, but the merge is not confirmed live yet'
        : 'marked Done, but the merge has not been confirmed yet';
    default:
      return verified ? `marked ${claimed}, but only ${verified} is confirmed` : `marked ${claimed}, but nothing has been confirmed yet`;
  }
}

/** The Owner section (openspec kanban-external-owner): null while the card is ours; else who
 * owns it, since when, set by the Operator. External wins over manual: another person's card
 * is theirs whatever else it says. */
export function ownerOf(node) {
  const name = node?.externalOwner ? String(node.externalOwner).trim() : '';
  if (!name) return null;
  return {
    key: 'external', icon: '👤', name, word: `${name} (external)`,
    text: 'out of our domain — the verifier, the policeman and the arch leave this card alone',
    source: 'operator', sourceLabel: sourceLabel('operator'), at: node.externalOwnerAt || null,
  };
}

/** ONE status for the Board check section. key ∈ external | manual | needs-human | unverified | honest.
 * `integrity` is the policeman/verifier verdict entry for this card ({state, reason}) or null;
 * `checkedAt` the verdict's timestamp when known. Always names a source and, when known, a time. */
export function boardCheckOf(node, { integrity = null, checkedAt = null, label = null } = {}) {
  if (!node) return null;
  const owner = ownerOf(node);
  if (owner) {
    return {
      key: 'external', icon: '👤', word: 'External owner',
      text: `${owner.name} owns this card — not ours to judge; nothing automatic touches it`,
      source: 'operator', sourceLabel: sourceLabel('operator'), at: owner.at, resolvable: false,
    };
  }
  if (node.manual) {
    return {
      key: 'manual', icon: '🔧', word: 'Manual',
      text: 'you are handling this card by hand — the policeman and the arch leave it alone',
      source: 'operator', sourceLabel: sourceLabel('operator'), at: node.manualAt || null, resolvable: false,
    };
  }
  if (node.needsHuman) {
    const by = node.needsHuman.by || 'policeman';
    const src = by === 'board-check' ? 'auto-verifier' : by === 'policeman' || by === 'agent' || by === 'operator' ? by : 'policeman';
    return {
      key: 'needs-human', icon: '🆘', word: 'Needs human',
      text: node.needsHuman.reason ? String(node.needsHuman.reason) : 'a human has to step in',
      source: src, sourceLabel: sourceLabel(src), at: node.needsHuman.at || null, resolvable: true,
    };
  }
  // A cross-repo effort whose column claims merged while a leg is not (openspec
  // cross-repo-effort-legs): the reason names every leg — the Knjiga-pošte rule.
  const mismatch = legsOf(node, { label }).mismatch;
  const unverified = !!mismatch || !!node.warning || integrity?.state === 'dishonest' || isUnverified(node.status, node.verifiedStatus);
  if (unverified) {
    return {
      key: 'unverified', icon: '⚠️', word: 'Not verified yet',
      text: mismatch || plainUnverifiedReason(node),
      source: 'auto-verifier', sourceLabel: sourceLabel('auto-verifier'), at: node.verifiedAt || checkedAt || null, resolvable: false,
    };
  }
  const settled = rank(node.status) > rank('doing');
  return {
    key: 'honest', icon: '✅', word: 'Honest',
    text: settled ? `${LABEL[node.status]} is confirmed by the facts` : 'board matches reality — nothing claimed beyond what the harness vouches for',
    source: 'auto-verifier', sourceLabel: sourceLabel('auto-verifier'), at: node.verifiedAt || checkedAt || null, resolvable: false,
  };
}

// ---- Agent (what the policeman read) --------------------------------------------------------

/** The observation vocabulary (openspec policeman-observes-agents): state → [icon, word,
 * meaning] — the same words the server's CardObservations carries and the explainer lists. */
export const OBSERVATIONS = {
  working: ['⚙️', 'Working', 'the agent is actively on it'],
  'waiting-review': ['👀', 'Waiting for review', 'its work is up as a pull request; nothing more from the agent until someone reviews'],
  'asked-question': ['❓', 'Asked a question', 'the agent asked something and nobody has answered'],
  blocked: ['⛔', 'Blocked', 'the agent says it cannot proceed'],
  'claims-done': ['🗣', 'Says done', 'the agent says it finished, but the facts do not show it yet'],
  idle: ['💤', 'Idle', 'nothing has happened in its conversation'],
  errored: ['💥', 'Errored', "the agent's last turn failed"],
};

/** The Agent section: what the policeman last read in the assignee's conversation, with
 * its provenance (who, when, which policeman session). Null when nothing was recorded. */
export function observationOf(node) {
  const o = node?.observation;
  if (!o) return null;
  const [icon, word, meaning] = OBSERVATIONS[o.state] || ['👁', o.state || 'Observed', ''];
  const by = o.by || 'policeman';
  return {
    key: OBSERVATIONS[o.state] ? o.state : 'other', icon, word, meaning,
    text: o.summary ? String(o.summary) : meaning,
    source: by, sourceLabel: by === 'policeman' ? 'seen by the policeman' : `seen by ${by}`,
    at: o.at || null, session: o.sessionId ? String(o.sessionId).slice(0, 8) : null,
    attention: o.state === 'asked-question' || o.state === 'blocked' || o.state === 'errored',
  };
}

// ---- Legs (a cross-repo effort, openspec cross-repo-effort-legs) ------------------------------

/** role → [icon, word, meaning] — the same words the server's Effort carries. */
export const ROLES = {
  driver: ['🚗', 'driver', 'the orchestrator that drives the other legs'],
  driven: ['🔩', 'driven', 'a product repo the driver drives'],
};

/** An AGENTLESS leg: a checkout no managed agent owns (its repoId is the synthetic path:<path>). */
export function isAgentlessLeg(a) {
  return !!(a?.path || String(a?.repoId || '').startsWith('path:'));
}
export function legPath(a) {
  if (!a) return null;
  if (a.path) return String(a.path);
  const r = String(a.repoId || '');
  return r.startsWith('path:') ? r.slice(5) : null;
}
/** The last two path segments: copy1/prg. */
export function pathTail(p) {
  const parts = String(p || '').split(/[\\/]+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] || String(p || ''));
}
/** Verified merged on GitHub (the verifier recorded pr-merged or done). */
export function legMerged(a) {
  return rank(a?.verifiedStatus) >= rank('pr-merged');
}
/** One leg's merge state in words — the same as the server's Effort.MergeWord. */
export function legMergeWord(a) {
  if (legMerged(a)) return a.prNumber ? `merged (PR #${a.prNumber})` : 'merged';
  if (a?.prNumber) return `PR #${a.prNumber} ${rank(a.verifiedStatus) >= rank('pr-opened') ? 'open, not merged' : 'not verified'}`;
  if (a?.prUrl) return 'PR recorded, not verified';
  return a?.branch ? 'no PR' : 'no PR recorded';
}

const legsListOf = (node) => {
  if (!node) return [];
  if (Array.isArray(node.assignees) && node.assignees.length > 0) return node.assignees.map((a) => ({ ...a, sourceId: a.sourceId || null, status: a.status || 'todo' }));
  return node.repoId ? [{ sourceId: node.sourceId || null, repoId: node.repoId, status: node.status || 'todo', branch: node.branch, prUrl: node.prUrl, prNumber: node.prNumber, verifiedStatus: node.verifiedStatus, role: null, path: null }] : [];
};

/** The Legs section. `label(a)` names an agent leg (its handle) — an agentless leg is named by
 * its path tail. Returns { show, crossRepo, legs, merged, total, allMerged, partiallyMerged,
 * summary, mismatch, title }: `show` when the card is an effort (several legs, or any leg typed
 * or agentless); `mismatch` = the plain-English reason when the column claims merged while a leg
 * is not — which is exactly the rule that would have caught the Knjiga-pošte card. */
export function legsOf(node, { label = null } = {}) {
  const list = legsListOf(node);
  const legs = list.map((a) => {
    const agentless = isAgentlessLeg(a);
    const path = legPath(a);
    const [roleIcon, roleWord, roleMeaning] = ROLES[a.role] || ['·', 'untyped', 'no role recorded'];
    const name = agentless ? pathTail(path) : (label ? label(a) : String(a.repoId || ''));
    return {
      key: `${a.sourceId || ''}|${a.repoId}`, label: name, role: a.role || null, roleIcon, roleWord, roleMeaning, agentless, path,
      status: a.status || 'todo', statusLabel: LABEL[a.status] || a.status || 'To do', verifiedStatus: a.verifiedStatus || null,
      merged: legMerged(a), mergeWord: legMergeWord(a), prUrl: a.prUrl || null, prNumber: a.prNumber || null, branch: a.branch || null, warning: a.warning || null,
    };
  });
  const total = legs.length;
  const merged = legs.filter((l) => l.merged).length;
  const crossRepo = total > 1;
  const allMerged = total > 0 && merged === total;
  const partiallyMerged = crossRepo && merged > 0 && !allMerged;
  const show = crossRepo || legs.some((l) => l.role || l.agentless);
  let mismatch = null;
  if (crossRepo && !allMerged && rank(node?.status) >= rank('pr-merged')) {
    const done = legs.filter((l) => l.merged).map((l) => `${l.label} ${l.mergeWord}`);
    const open = legs.filter((l) => !l.merged).map((l) => `${l.label} — ${l.mergeWord}`);
    mismatch = `cross-repo effort: ${merged} of ${total} legs merged on GitHub (${done.length ? done.join(', ') : 'none'}); not merged: ${open.join('; ')} — the card is not ${node.status === 'done' ? 'done' : 'merged'} until every leg is merged`;
  }
  const summary = total === 0 ? 'no legs' : `${merged} of ${total} leg${total === 1 ? '' : 's'} merged${partiallyMerged ? ' — partially merged, not done' : allMerged ? ' — every leg merged' : ''}`;
  const title = show ? `A cross-repo effort: ${legs.map((l) => `${l.label} (${l.roleWord}${l.agentless ? ', no agent' : ''}: ${l.mergeWord})`).join('; ')}. The card is done only when EVERY leg's PR is verified merged on GitHub.` : '';
  return { show, crossRepo, legs, merged, total, allMerged, partiallyMerged, summary, mismatch, title };
}

// ---- Links -------------------------------------------------------------------------------

/** The labeled, collapsible facts: branch, PR, verified state, pings, dependencies, origin.
 * Returns { items: [{ key, label, value, href?, note?, tone? }], summary } — summary is the
 * short line shown while collapsed (the two or three things that matter). */
export function linksOf(node, { prereqs = [], blockedBy = [], stale = false, now = Date.now(), ideaNumber = null } = {}) {
  const items = [];
  if (node?.branch) {
    items.push({
      key: 'branch', label: 'Branch', value: node.branch,
      note: node.pushed === false ? 'not on origin — it lives only on the machine that did the work' : node.pushed ? 'on origin' : null,
      tone: node.pushed === false ? 'warn' : 'plain',
    });
  }
  if (node?.prUrl) {
    items.push({
      key: 'pr', label: 'Pull request', value: node.prNumber ? `PR #${node.prNumber}` : 'PR', href: node.prUrl,
      note: node.mergeCommit ? `merged as ${String(node.mergeCommit).slice(0, 8)}` : 'open',
      tone: node.mergeCommit ? 'ok' : 'plain',
    });
  }
  if (node?.verifiedStatus) {
    items.push({ key: 'verified', label: 'Verified', value: LABEL[node.verifiedStatus] || node.verifiedStatus, note: node.verifiedAt ? `${ago(now - node.verifiedAt)} ago, by the auto-verifier` : 'by the auto-verifier', tone: 'plain' });
  }
  if (node?.dispatchedAt) {
    items.push({ key: 'pinged', label: 'Pinged', value: `${ago(now - node.dispatchedAt)} ago${node.dispatchCount > 1 ? ` (×${node.dispatchCount})` : ''}`, tone: 'plain' });
  }
  if (stale) {
    items.push({ key: 'stale', label: 'Stale', value: `no activity for ${ago(now - (node?.updatedAt || 0))}`, note: node?.status === 'committed' ? 'an unpushed branch parked on one machine' : node?.prUrl ? 'a pull request nobody is moving' : 'nothing has moved since the last ping', tone: 'warn' });
  }
  if (blockedBy.length > 0) {
    items.push({ key: 'blocked', label: 'Blocked by', value: blockedBy.join(', '), tone: 'warn' });
  } else if (prereqs.length > 0) {
    items.push({ key: 'prereqs', label: 'Prerequisites', value: `${prereqs.length} done`, tone: 'ok' });
  }
  if (node?.createdBy && node.createdBy !== 'human') items.push({ key: 'created', label: 'Created by', value: node.createdBy, tone: 'plain' });
  if (node?.ideaId) items.push({ key: 'idea', label: 'From idea', value: ideaNumber ? `#${ideaNumber}` : 'an idea', tone: 'plain' });

  const brief = [];
  if (node?.branch) brief.push(`⎇ ${node.branch}${node.pushed === false ? ' (not on origin)' : ''}`);
  if (node?.prUrl) brief.push(node.prNumber ? `PR #${node.prNumber}` : 'PR');
  if (stale) brief.push('stale');
  if (blockedBy.length > 0) brief.push('blocked');
  const summary = brief.length ? brief.join(' · ') : `${items.length} detail${items.length === 1 ? '' : 's'}`;
  return { items, summary };
}
