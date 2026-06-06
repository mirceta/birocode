import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import Breadcrumbs from '../components/files/Breadcrumbs';
import FileList from '../components/files/FileList';
import FileViewer from '../components/files/FileViewer';
import { useT } from '../i18n/LanguageContext';
import '../components/files/files.css';

function joinPath(dir, name) {
  if (dir === '/' || dir === '') return `/${name}`;
  return `${dir}/${name}`;
}

export default function Files() {
  const { t } = useT();
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const loadDir = useCallback(
    async (dirPath) => {
      setListLoading(true);
      setListError('');
      try {
        const data = await apiGet(`/files?path=${encodeURIComponent(dirPath)}`);
        setEntries(Array.isArray(data) ? data : []);
      } catch {
        setEntries([]);
        setListError(t('files.loadError'));
      } finally {
        setListLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    loadDir(path);
  }, [path, loadDir]);

  function navigateTo(dirPath) {
    setOpenFile(null);
    setFileError('');
    setPath(dirPath);
  }

  function openDir(name) {
    navigateTo(joinPath(path, name));
  }

  async function openFileByName(name) {
    const filePath = joinPath(path, name);
    setOpenFile({ name, path: filePath });
    setFileContent('');
    setFileError('');
    setFileLoading(true);
    try {
      const data = await apiGet(`/files/read?path=${encodeURIComponent(filePath)}`);
      setFileContent(typeof data === 'string' ? data : data.content || '');
    } catch {
      setFileError(t('files.previewError'));
    } finally {
      setFileLoading(false);
    }
  }

  function closeFile() {
    setOpenFile(null);
    setFileError('');
    setFileContent('');
  }

  if (openFile) {
    if (fileLoading) {
      return <Loading label={t('files.opening')} />;
    }
    if (fileError) {
      return (
        <div className="file-viewer">
          <div className="file-viewer__bar">
            <button type="button" className="file-viewer__back" onClick={closeFile}>
              <span aria-hidden="true">&larr;</span> {t('common.back')}
            </button>
            <span className="file-viewer__name" title={openFile.name}>
              {openFile.name}
            </span>
          </div>
          <ErrorBanner message={fileError} />
        </div>
      );
    }
    return <FileViewer name={openFile.name} content={fileContent} onBack={closeFile} />;
  }

  return (
    <div className="files-page">
      <Breadcrumbs path={path} onNavigate={navigateTo} />

      {listLoading ? (
        <Loading label={t('files.loadingList')} />
      ) : listError ? (
        <ErrorBanner message={listError} onRetry={() => loadDir(path)} />
      ) : (
        <FileList entries={entries} onOpenDir={openDir} onOpenFile={openFileByName} />
      )}
    </div>
  );
}
