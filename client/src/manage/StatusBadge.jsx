// The ONE badge the Status tab renders its states with (fleet task a25ee2de): a pill
// whose tone (ok / warn / bad / muted / unknown / accent / plain) is the same set the
// Overview rows already used, so a "yes", "behind the hub", "unreachable" or "unknown"
// reads with one shape and colour wherever it appears. Descriptors come from
// statusBadges.js; `data` becomes data-* attributes (claimedReason → data-claimed-reason).
const dataAttrs = (data) => Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v]));

export default function StatusBadge({ badge, className = '' }) {
  if (!badge) return null;
  const { key, label, tone = 'plain', mono, title, data } = badge;
  return (
    <span
      className={`fs__badge fs__badge--${tone}${mono ? ' fs__badge--mono' : ''}${className ? ` ${className}` : ''}`}
      title={title || undefined}
      data-badge={key}
      data-tone={tone}
      {...dataAttrs(data)}
    >
      {label}
    </span>
  );
}

export function StatusBadges({ badges, className = '', ...rest }) {
  return (
    <span className={`fs__badges${className ? ` ${className}` : ''}`} {...rest}>
      {(badges || []).map((b) => <StatusBadge key={b.key} badge={b} />)}
    </span>
  );
}
