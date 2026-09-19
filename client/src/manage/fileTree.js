// The File System tab's tree (openspec hubfs-large-files-tree): hub paths are namespaced
// (prefix/name), so every slash is a folder level. Pure, node-tested: build a tree from flat
// file rows, fold it into visible rows given the collapsed folders, toggle. The view renders
// ONLY what these return.

/** A folder node: { type:'folder', name, path, folders:[], files:[], count, bytes, latest }. */
export function buildTree(files) {
  const root = folder('', '');
  for (const f of files || []) {
    const parts = String(f.path || '').split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      let next = node.folders.find((d) => d.name === name);
      if (!next) { next = folder(name, node.path ? `${node.path}/${name}` : name); node.folders.push(next); }
      node = next;
    }
    node.files.push({ type: 'file', name: parts[parts.length - 1] || f.path, file: f });
  }
  finish(root);
  return root;
}

function folder(name, path) { return { type: 'folder', name, path, folders: [], files: [], count: 0, bytes: 0, latest: 0 }; }

function finish(node) {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  let count = node.files.length;
  let bytes = node.files.reduce((n, x) => n + (x.file.size || 0), 0);
  let latest = node.files.reduce((n, x) => Math.max(n, x.file.updatedAt || x.file.uploadedAt || 0), 0);
  for (const d of node.folders) { finish(d); count += d.count; bytes += d.bytes; latest = Math.max(latest, d.latest); }
  node.count = count; node.bytes = bytes; node.latest = latest;
}

/** The visible rows, depth-first: a folder row, then (unless collapsed) its folders and files.
 * `collapsed` is a Set of folder paths. Folders come before files at every level. */
export function flattenTree(root, collapsed = new Set()) {
  const rows = [];
  const walk = (node, depth) => {
    for (const d of node.folders) {
      const open = !collapsed.has(d.path);
      rows.push({ type: 'folder', depth, node: d, open });
      if (open) walk(d, depth + 1);
    }
    for (const x of node.files) rows.push({ type: 'file', depth, name: x.name, file: x.file });
  };
  walk(root, 0);
  return rows;
}

/** Every folder path in the tree (for expand all / collapse all). */
export function folderPaths(root) {
  const out = [];
  const walk = (node) => { for (const d of node.folders) { out.push(d.path); walk(d); } };
  walk(root);
  return out;
}

/** A new Set with `path` toggled. */
export function toggleCollapsed(collapsed, path) {
  const next = new Set(collapsed);
  if (next.has(path)) next.delete(path); else next.add(path);
  return next;
}
