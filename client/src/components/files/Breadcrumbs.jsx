// Breadcrumb navigation for the file browser: Home > folder > subfolder.
// Renders the current path as tappable segments. Tapping a segment jumps to
// that level via onNavigate(path); the current (last) segment is not tappable.
//
// `path` is a POSIX-style path like "/business-plan/financials". Root is "/".
export default function Breadcrumbs({ path, onNavigate }) {
  const segments = path.split('/').filter(Boolean);

  // Build a crumb for Home plus one per segment, each carrying the absolute
  // path to navigate to when tapped.
  const crumbs = [{ label: 'Home', target: '/' }];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ label: seg, target: acc });
  }

  return (
    <nav className="breadcrumbs" aria-label="Folder path">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.target} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span className="breadcrumbs__sep" aria-hidden="true">&gt;</span>}
            <button
              type="button"
              className="breadcrumbs__crumb"
              disabled={isLast}
              onClick={() => onNavigate(crumb.target)}
              aria-current={isLast ? 'page' : undefined}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
