// M6 -- Read-only file browser. The user navigates folders and reads files
// to confirm the changes Claude made in chat. All backend calls go through
// M4's api client (apiGet), which handles auth.
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import Breadcrumbs from '../components/files/Breadcrumbs';
import FileList from '../components/files/FileList';
import FileViewer from '../components/files/FileViewer';
import '../components/files/files.css';

// Join a directory path and a child name into a clean POSIX path.
function joinPath(dir, name) {
  if (dir === '/' || dir === '') return `/${name}`;
  return `${dir}/${name}`;
}

export default function Files() {
  const [path, setPath] = useState('/'); // current directory
  const [entries, setEntries] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // The open file, or null when browsing the directory listing.
  const [openFile, setOpenFile] = useState(null); // { name, path }
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const loadDir = useCallback(async (dirPath) => {
    setListLoading(true);
    setListError('');
    try {
      const data = await apiGet(`/files?path=${encodeURIComponent(dirPath)}`);
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setEntries([]);
      setListError("We couldn't open this folder. Please try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDir(path);
  }, [path, loadDir]);

  // Breadcrumb / folder navigation always returns to the listing view.
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
      setFileError("This file can't be previewed.");
    } finally {
      setFileLoading(false);
    }
  }

  function closeFile() {
    setOpenFile(null);
    setFileError('');
    setFileContent('');
  }

  // ---- File viewer mode ----
  if (openFile) {
    if (fileLoading) {
      return <Loading label="Opening file..." />;
    }
    if (fileError) {
      return (
        <div className="file-viewer">
          <div className="file-viewer__bar">
            <button type="button" className="file-viewer__back" onClick={closeFile}>
              <span aria-hidden="true">&larr;</span> Back
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

  // ---- Directory listing mode ----
  return (
    <div className="files-page">
      <Breadcrumbs path={path} onNavigate={navigateTo} />

      {listLoading ? (
        <Loading label="Loading your files..." />
      ) : listError ? (
        <ErrorBanner message={listError} onRetry={() => loadDir(path)} />
      ) : (
        <FileList entries={entries} onOpenDir={openDir} onOpenFile={openFileByName} />
      )}
    </div>
  );
}
