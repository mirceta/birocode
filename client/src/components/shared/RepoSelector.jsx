import { useRepo } from '../../context/RepoContext';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';

// Header dropdown for choosing which project (repository) to work in. Shows only
// the friendly project name -- the underlying folder path is an operator concern
// and is managed/visible in the desktop GUI, not exposed to the phone user. The
// selection is per-device and drives every request. Hidden until at least one
// repository is available.
export default function RepoSelector() {
  const { repos, currentRepoId, selectRepo, loading } = useRepo();
  const { t } = useT();
  const visible = useFeature('repoSelector');

  if (!visible) return null;
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
