// Map raw Claude tool names to translation keys for the friendly status label.
const KEYS = {
  Write: 'tool.editing',
  Edit: 'tool.editing',
  Read: 'tool.reading',
  Bash: 'tool.working',
};

export function toolLabel(name, t) {
  return t(KEYS[name] || 'tool.working');
}
