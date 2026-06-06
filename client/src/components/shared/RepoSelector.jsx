import { useRepo } from '../../context/RepoContext';
import { useT } from '../../i18n/LanguageContext';

// Header dropdown for choosing which project (repository) to work in. The
// selection is per-device and drives every chat/files/history request. Hidden
// until at least one repository is available.
export default function RepoSelector() {
  const { repos, currentRepoId, selectRepo, loading } = useRepo();
  const { t } = useT();

  if (loading && repos.length === 0) return null;
  if (repos.length === 0) {
    return <span className="repo-selector repo-selector--empty">{t('repo.none')}</span>;
  }

  return (
    <label className="repo-selector" aria-label={t('repo.label')}>
      <span className="repo-selector__icon" aria-hidden="true">
        📁
      </span>
      <select
        className="repo-selector__select"
        value={currentRepoId}
        onChange={(e) => selectRepo(e.target.value)}
        aria-label={t('repo.label')}
      >
        {repos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
