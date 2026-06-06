import { useT } from '../../i18n/LanguageContext';

export default function Breadcrumbs({ path, onNavigate }) {
  const { t } = useT();
  const segments = path.split('/').filter(Boolean);

  const crumbs = [{ label: t('files.home'), target: '/' }];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ label: seg, target: acc });
  }

  return (
    <nav className="breadcrumbs" aria-label={t('files.pathAria')}>
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
