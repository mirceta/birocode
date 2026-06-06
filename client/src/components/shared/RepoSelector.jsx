import { useRepo } from '../../context/RepoContext';
import { useT } from '../../i18n/LanguageContext';

// Header control for choosing which project (repository) to work in. Shows the
// project name in a dropdown plus the folder it maps to on disk, so it is
// always clear which directory the chat/files/history are pointed at. The
// selection is per-device and drives every request. Hidden until at least one
// repository is available.
export default function RepoSelector() {
  const { repos, currentRepoId, current, selectRepo, loading } = useRepo();
  const { t } = useT();

  if (loading && repos.length === 0) return null;
  if (repos.length === 0) {
    return <span className="repo-selector repo-selector--empty">{t('repo.none')}</span>;
  }

  return (
    <div className="repo-selector" title={current?.path || ''}>
      <label className="repo-selector__row" aria-label={t('repo.label')}>
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
            <option key={r.id} value={r.id} title={r.path}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {current?.path && (
        <span className="repo-selector__path" title={current.path}>
          {current.path}
        </span>
      )}
    </div>
  );
}
