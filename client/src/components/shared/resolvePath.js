// Resolve a relative href against the current file's directory. Mirrors
// browser URL semantics (`../`, `./`, leading `/` = repo root). Lenient on
// purpose — the server validates traversal. Shared by the Plan tab's subplan
// navigation and the Files viewer's doc links (plans/doc-viewer.md slice 2).
export default function resolvePath(currentPath, href) {
  // Strip an in-file anchor; the caller decides what to do with it.
  const hashAt = href.indexOf('#');
  const file = hashAt === -1 ? href : href.slice(0, hashAt);
  if (file.startsWith('/')) return file.replace(/^\/+/, '');
  const baseSegs = currentPath.split('/').slice(0, -1);
  const segs = baseSegs.concat(file.split('/'));
  const out = [];
  for (const s of segs) {
    if (s === '' || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
}
