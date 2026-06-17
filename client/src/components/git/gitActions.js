// Eligibility for the Git tab's inward-sync actions, derived from a
// /api/git/status payload. Extracted (plans/dock-git-actions.md) so the Git tab
// AND the dashboard agent docks compute "can I merge / pull here?" identically
// and can't drift — the docks surface the same actions in their git-status row.
//
// `clean` guards optionally: the dashboard's status payload carries `files` like
// the Git tab's, but a defensive `?? 0` keeps a payload without it from throwing.
export function deriveGitActions(status) {
  const onBase = status.branch === status.localBaseBranch;
  const busy = !!status.busy;
  const base = status.localBaseBranch || status.baseBranch;
  const clean = (status.files?.length ?? 0) === 0;
  return {
    onBase,
    busy,
    base,
    clean,
    // Merge base into the feature branch: only when clean, off-base, behind the
    // local base, and the local/origin base agree (no rebase surprise).
    canMerge:
      !busy && clean && !onBase && status.baseBehind > 0
      && status.baseBranch === status.localBaseBranch,
    // Pull main: on base it's a fast-forward of base itself; off base it's base
    // drifting behind its own upstream.
    canPullMain: !busy && !!base && (onBase ? status.behind > 0 : status.baseDriftBehind > 0),
    // Pull this branch from its own upstream.
    canPullBranch: !busy && !onBase && !!status.upstream && status.behind > 0,
    // Publishable (no upstream yet) or carrying unpushed commits. Not surfaced
    // in the docks — push stays a deliberate Git-tab action.
    canPush: !busy && (!status.upstream || status.ahead > 0),
  };
}

// The POST endpoint for a "pull main" click depends on whether we're on the
// base branch (fast-forward base) or a feature branch (pull base's drift).
export function pullMainPath(onBase) {
  return onBase ? '/git/pull-current' : '/git/pull-base';
}
