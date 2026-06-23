// Read-only badge showing a repo's per-project chat permission preset
// (openspec add-per-project-claude-permissions). The preset is CONFIGURED ONLY on
// the desktop GUI (RepositoriesForm) — this badge merely REFLECTS it on each
// dashboard agent dock so the operator can see, at a glance, what the agent for
// that project is allowed to do. Display-only: a plain <span> (no toggle), so it
// sits harmlessly inside the open-agent <button> and a click just opens the agent.
// `className` selects per-surface placement (dash-cell__perm / phone__perm).

// value -> { short, label, title }. Mirrors the desktop dialog's wording.
const PRESETS = {
  readonly: {
    short: 'RO',
    label: 'Read-only',
    title: 'Read-only — the agent can read this project but make no edits and run no commands.',
  },
  editonly: {
    short: 'EO',
    label: 'Edit-only',
    title: 'Edit-only — the agent can edit files in this repo, but run no scripts/exes and reach no network.',
  },
  standard: {
    short: 'STD',
    label: 'Standard',
    title: 'Standard — in-repo development is allowed; destructive/exfiltration actions are denied.',
  },
  full: {
    short: 'FULL',
    label: 'Full access',
    title: 'Full access — no added restriction is applied to this project\'s chat.',
  },
};

export default function PermissionBadge({ policy, className = '' }) {
  // Anything unknown/missing falls back to the safe default, matching the
  // backend's NormalizePolicy (null/unknown -> readonly).
  const preset = PRESETS[policy] || PRESETS.readonly;
  const key = PRESETS[policy] ? policy : 'readonly';

  return (
    <span
      className={`perm-badge perm-badge--${key}${className ? ` ${className}` : ''}`}
      title={preset.title}
      aria-label={`Permissions: ${preset.label}`}
    >
      {preset.short}
    </span>
  );
}
