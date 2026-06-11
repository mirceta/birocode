import { useState } from 'react';
import { apiPost } from '../api/client';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import './projects.css';

// Projects tab (plans/projects-tab.md): the single place to see, switch and
// register projects. Replaces the old header dropdown. Selection stays
// device-local (RepoContext.selectRepo); adding registers the path on the
// backend at runtime via POST /api/repos — no harness restart.
export default function Projects() {
  const { repos, currentRepoId, selectRepo, loading, error, reloadRepos } = useRepo();
  const { t } = useT();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null); // { ok: bool, text: string }

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!path.trim() || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      const repo = await apiPost('/repos', { path: path.trim(), name: name.trim() || null });
      await reloadRepos();
      selectRepo(repo.id);
      setPath('');
      setName('');
      setNotice({ ok: true, text: t('projects.added', { name: repo.name }) });
    } catch (err) {
      let msg = '';
      try {
        msg = JSON.parse(err.message)?.error || '';
      } catch {
        /* body was not JSON */
      }
      setNotice({ ok: false, text: msg || t('projects.addError') });
    } finally {
      setAdding(false);
    }
  };

  if (loading && repos.length === 0) return <Loading />;
  if (error) return <ErrorBanner message={t('projects.loadError')} onRetry={reloadRepos} />;

  return (
    <div className="projects">
      <div className="projects__header">
        <h2 className="projects__title">{t('projects.title')}</h2>
      </div>

      <ul className="projects__list">
        {repos.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`project-card${r.id === currentRepoId ? ' project-card--active' : ''}`}
              onClick={() => selectRepo(r.id)}
            >
              <span className="project-card__body">
                <span className="project-card__name">{r.name}</span>
                <span className="project-card__path">{r.path}</span>
              </span>
              <span className="project-card__badges">
                {!r.exists && <span className="project-card__badge project-card__badge--warn">{t('projects.missing')}</span>}
                {r.exists && !r.isGitRepo && <span className="project-card__badge">{t('projects.notGit')}</span>}
                {r.id === currentRepoId && <span className="project-card__badge project-card__badge--active">{t('projects.active')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <form className="projects__add" onSubmit={handleAdd}>
        <h3 className="projects__add-title">{t('projects.newTitle')}</h3>
        <label className="projects__field">
          <span className="projects__field-label">{t('projects.pathLabel')}</span>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t('projects.pathPlaceholder')}
            disabled={adding}
          />
        </label>
        <label className="projects__field">
          <span className="projects__field-label">{t('projects.nameLabel')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={adding}
          />
        </label>
        <button type="submit" className="projects__add-btn" disabled={adding || !path.trim()}>
          {adding ? t('projects.adding') : t('projects.add')}
        </button>
        {notice && (
          <p className={`projects__notice${notice.ok ? '' : ' projects__notice--error'}`}>{notice.text}</p>
        )}
      </form>
    </div>
  );
}
