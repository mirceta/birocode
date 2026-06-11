import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
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
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null); // { ok: bool, text: string }
  // { root, folders: [{ name, registered }] } — subfolders of the playground.
  const [hostFolders, setHostFolders] = useState(null);

  const loadFolders = useCallback(() => {
    apiGet('/repos/folders').then(setHostFolders).catch(() => setHostFolders(null));
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!folder.trim() || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      const repo = await apiPost('/repos', { folder: folder.trim(), name: name.trim() || null });
      await reloadRepos();
      loadFolders();
      selectRepo(repo.id);
      setFolder('');
      setName('');
      setNotice({
        ok: true,
        text: t(repo.created ? 'projects.addedCreated' : 'projects.added', { name: repo.name }),
      });
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
        {hostFolders?.folders?.some((f) => !f.registered) && (
          <div className="projects__field">
            <span className="projects__field-label">{t('projects.existingFolders')}</span>
            <div className="projects__folder-chips">
              {hostFolders.folders.filter((f) => !f.registered).map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className={`projects__folder-chip${f.name === folder ? ' projects__folder-chip--selected' : ''}`}
                  onClick={() => setFolder(f.name)}
                  disabled={adding}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="projects__field">
          <span className="projects__field-label">
            {t('projects.folderLabel', { root: hostFolders?.root || '...' })}
          </span>
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={adding}
          />
          <span className="projects__field-hint">{t('projects.folderHint')}</span>
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
        <button type="submit" className="projects__add-btn" disabled={adding || !folder.trim()}>
          {adding ? t('projects.adding') : t('projects.add')}
        </button>
        {notice && (
          <p className={`projects__notice${notice.ok ? '' : ' projects__notice--error'}`}>{notice.text}</p>
        )}
      </form>
    </div>
  );
}
