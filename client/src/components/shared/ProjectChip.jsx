import { Link } from 'react-router-dom';
import { useRepo } from '../../context/RepoContext';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';

// Header chip showing the active project's name. Replaces the old header
// dropdown (plans/projects-tab.md): switching and adding projects now happens
// in the Projects tab, which this chip links to.
export default function ProjectChip() {
  const visible = useFeature('projectsTab');
  const { current, loading } = useRepo();
  const { t } = useT();

  if (!visible) return null;
  if (loading && !current) return null;

  return (
    <Link to="/studio/projects" className="project-chip" aria-label={t('repo.label')}>
      <span className="project-chip__icon" aria-hidden="true">
        📁
      </span>
      <span className="project-chip__name">{current ? current.name : t('repo.none')}</span>
    </Link>
  );
}
