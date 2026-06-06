// Map raw Claude tool names to friendly, non-technical status labels.
// The user never sees tool names like "Write" or "Bash" -- only plain
// descriptions of what is happening to her documents.
const LABELS = {
  Write: 'Editing document...',
  Edit: 'Editing document...',
  Read: 'Reading file...',
  Bash: 'Working...',
};

export function toolLabel(name) {
  return LABELS[name] || 'Working...';
}
