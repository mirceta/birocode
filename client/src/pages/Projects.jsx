import { useCallback, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../api/client';
import { useRepo } from '../context/RepoContext';
import { useUiMode } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import './projects.css';

// Projects tab (plans/projects-tab.md): the single place to see, switch and
// register projects. Replaces the old header dropdown. Selection stays
// device-local (RepoContext.selectRepo); adding registers the path on the
// backend at runtime via POST /api/repos — no harness restart.
//
// New-project flow (plans/projects-folder-picker.md): a collapsed
// "+ New project" button opens a navigable folder picker scoped to the
// Projects Root. Registering never creates folders implicitly — creation is
// a separate, explicit action.
//
// Per-project visibility (plans/project-visibility.md): Basic mode lists
// only projects with visibility 'basic'; Advanced lists all and can toggle
// each project between Basic and Advanced-only. New projects are stamped
// with the creating device's mode.
export default function Projects() {
  const { repos, currentRepoId, selectRepo, loading, error, reloadRepos } = useRepo();
  const { isAdvanced } = useUiMode();
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [newFolder, setNewFolder] = useState(''); // "create folder here" input
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(''); // id of the project being removed
  const [notice, setNotice] = useState(null); // { ok: bool, text: string }
  // Picker state: { root, path, folders: [{ name, registered, isGitRepo }] }
  const [picker, setPicker] = useState(null);

  const loadFolders = useCallback((path) => {
    apiGet(`/repos/folders?path=${encodeURIComponent(path || '')}`)
      .then(setPicker)
      .catch(() => setPicker(null));
  }, []);

  const openPicker = (path) => {
    loadFolders(path);
    if (!nameTouched) setName(path ? path.split('/').pop() : '');
    setNotice(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setPicker(null);
    setName('');
    setNameTouched(false);
    setNewFolder('');
    setNotice(null);
  };

  const failNotice = (err) => {
    let msg = '';
    try {
      msg = JSON.parse(err.message)?.error || '';
    } catch {
      /* body was not JSON */
    }
    setNotice({ ok: false, text: msg || t('projects.addError') });
  };

  const register = async (folder, createFolder) => {
    if (adding) return;
    setAdding(true);
    setNotice(null);
    try {
      const repo = await apiPost('/repos', {
        folder,
        name: createFolder ? null : name.trim() || null,
        visibility: isAdvanced ? 'advanced' : 'basic',
        createFolder,
      });
      await reloadRepos();
      selectRepo(repo.id);
      closeForm();
      setNotice({
        ok: true,
        text: t(repo.created ? 'projects.addedCreated' : 'projects.added', { name: repo.name }),
      });
    } catch (err) {
      failNotice(err);
    } finally {
      setAdding(false);
    }
  };

  // Breadcrumb segments for the current picker path.
  const crumbs = picker?.path ? picker.path.split('/') : [];

  const toggleVisibility = async (r) => {
    const visibility = r.visibility === 'basic' ? 'advanced' : 'basic';
    try {
      await apiPost(`/repos/${r.id}/visibility`, { visibility });
      await reloadRepos();
    } catch {
      setNotice({ ok: false, text: t('projects.visError') });
    }
  };

  // Unregister a project from the harness. This only drops the repositories.json
  // entry — the folder stays on disk (the mirror of add, which can register a
  // pre-existing folder). RepoContext.reloadRepos() self-heals the active
  // selection if the removed project was the current one.
  const remove = async (r) => {
    if (removing) return;
    if (!window.confirm(t('projects.confirmRemove', { name: r.name }))) return;
    setRemoving(r.id);
    setNotice(null);
    try {
      await apiDelete(`/repos/${r.id}`);
      await reloadRepos();
      setNotice({ ok: true, text: t('projects.removed', { name: r.name }) });
    } catch {
      setNotice({ ok: false, text: t('projects.removeError') });
    } finally {
      setRemoving('');
    }
  };

  const visibleRepos = isAdvanced ? repos : repos.filter((r) => r.visibility === 'basic');

  if (loading && repos.length === 0) return <Loading />;
  if (error) return <ErrorBanner message={t('projects.loadError')} onRetry={reloadRepos} />;

  return (
    <div className="projects">
      <div className="projects__header">
        <h2 className="projects__title">{t('projects.title')}</h2>
      </div>

      <ul className="projects__list">
        {visibleRepos.map((r) => (
          <li key={r.id} className="projects__item">
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
            {isAdvanced && (
              <button
                type="button"
                className={`project-card__vis${r.visibility === 'basic' ? ' project-card__vis--basic' : ''}`}
                onClick={() => toggleVisibility(r)}
                title={t('projects.visToggleHint')}
              >
                {t(r.visibility === 'basic' ? 'projects.visBasic' : 'projects.visAdvanced')}
              </button>
            )}
            {!r.isSelf && (
              <button
                type="button"
                className="project-card__remove"
                onClick={() => remove(r)}
                disabled={removing === r.id}
                title={t('projects.remove')}
                aria-label={t('projects.remove')}
              >
                {removing === r.id ? '…' : '🗑'}
              </button>
            )}
          </li>
        ))}
        {visibleRepos.length === 0 && (
          <li className="projects__empty">{t('projects.noneBasic')}</li>
        )}
      </ul>

      {!showForm && (
        <button
          type="button"
          className="projects__add-btn projects__new-btn"
          onClick={() => {
            setShowForm(true);
            openPicker('');
          }}
        >
          + {t('projects.newTitle')}
        </button>
      )}

      {showForm && (
        <div className="projects__add">
          <div className="projects__add-head">
            <h3 className="projects__add-title">{t('projects.newTitle')}</h3>
            <button type="button" className="projects__close" onClick={closeForm} title={t('projects.cancel')}>
              ✕
            </button>
          </div>

          <nav className="projects__crumbs" aria-label={t('projects.pickerLabel')}>
            <button type="button" className="projects__crumb" onClick={() => openPicker('')} disabled={adding}>
              {picker?.root?.split(/[\\/]/).pop() || '...'}
            </button>
            {crumbs.map((seg, i) => (
              <span key={crumbs.slice(0, i + 1).join('/')}>
                {' / '}
                <button
                  type="button"
                  className="projects__crumb"
                  onClick={() => openPicker(crumbs.slice(0, i + 1).join('/'))}
                  disabled={adding}
                >
                  {seg}
                </button>
              </span>
            ))}
          </nav>

          <ul className="projects__picker-list">
            {(picker?.folders || []).map((f) => {
              const sub = picker.path ? `${picker.path}/${f.name}` : f.name;
              return (
                <li key={f.name}>
                  <button
                    type="button"
                    className="projects__picker-row"
                    onClick={() => openPicker(sub)}
                    disabled={adding || f.registered}
                  >
                    <span className="projects__picker-name">📁 {f.name}</span>
                    {f.registered && <span className="project-card__badge">{t('projects.alreadyProject')}</span>}
                    {!f.registered && f.isGitRepo && <span className="project-card__badge">git</span>}
                  </button>
                </li>
              );
            })}
            {picker && picker.folders.length === 0 && (
              <li className="projects__empty">{t('projects.pickerEmpty')}</li>
            )}
          </ul>

          {picker?.path && (
            <>
              <label className="projects__field">
                <span className="projects__field-label">{t('projects.nameLabel')}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  disabled={adding}
                />
              </label>
              <button
                type="button"
                className="projects__add-btn"
                onClick={() => register(picker.path, false)}
                disabled={adding}
              >
                {adding ? t('projects.adding') : t('projects.useFolder', { name: crumbs[crumbs.length - 1] })}
              </button>
            </>
          )}

          <div className="projects__create-row">
            <input
              type="text"
              placeholder={t('projects.createPlaceholder')}
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              disabled={adding}
            />
            <button
              type="button"
              className="projects__add-btn"
              onClick={() => register(picker?.path ? `${picker.path}/${newFolder.trim()}` : newFolder.trim(), true)}
              disabled={adding || !newFolder.trim()}
            >
              {t('projects.createHere')}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={`projects__notice${notice.ok ? '' : ' projects__notice--error'}`}>{notice.text}</p>
      )}
    </div>
  );
}
