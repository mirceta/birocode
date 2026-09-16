// Kanban card SECTIONS (openspec kanban-card-sections): the pure rules behind a card that
// explains itself instead of a row of cryptic badges. Framework-free (node --test), like
// kanbanColumns.js / kanbanLayout.js.
//
//   Header      — #ref · title · assignees                       (rendered by the board)
//   Progress    — the lifecycle as steps, the current one lit     progressOf()
//   Board check — ONE plain-English status that always names WHO set it and WHEN:
//                 ✅ Honest · ⚠️ Not verified yet · 🆘 Needs human · 🔧 Manual
//                                                                  boardCheckOf()
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

/** ONE status for the Board check section. key ∈ manual | needs-human | unverified | honest.
 * `integrity` is the policeman/verifier verdict entry for this card ({state, reason}) or null;
 * `checkedAt` the verdict's timestamp when known. Always names a source and, when known, a time. */
export function boardCheckOf(node, { integrity = null, checkedAt = null } = {}) {
  if (!node) return null;
  if (node.manual) {
    return {
      key: 'manual', icon: '🔧', word: 'Manual',
      text: 'you are handling this card by hand — the policeman and the arch leave it alone',
      source: 'operator', sourceLabel: sourceLabel('operator'), at: node.manualAt || null, resolvable: false,
    };
  }
  if (node.needsHuman) {
    const by = node.needsHuman.by || 'policeman';
    const src = by === 'policeman' || by === 'agent' || by === 'operator' ? by : 'policeman';
    return {
      key: 'needs-human', icon: '🆘', word: 'Needs human',
      text: node.needsHuman.reason ? String(node.needsHuman.reason) : 'a human has to step in',
      source: src, sourceLabel: sourceLabel(src), at: node.needsHuman.at || null, resolvable: true,
    };
  }
  const unverified = !!node.warning || integrity?.state === 'dishonest' || isUnverified(node.status, node.verifiedStatus);
  if (unverified) {
    return {
      key: 'unverified', icon: '⚠️', word: 'Not verified yet',
      text: plainUnverifiedReason(node),
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
