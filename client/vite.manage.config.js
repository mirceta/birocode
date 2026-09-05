import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The Management App build (openspec management-app): a second entry over the
// same source tree, emitted into events-app/manage/ — a build-less static folder
// the harness already serves no-store from the repo worktree at
// /api/localview/<repo>/app/events-feed/manage/. Relative base so the bundle
// works under that proxy sub-path (docs/local-exposure-convention.md).
//   npm --prefix client run build:manage
// then refresh the page. No harness redeploy.
const OUT = resolve(__dirname, '../events-app/manage');

// The harness serves <folder>/index.html for a folder request; Vite names the
// emitted page after its entry file, so rename manage.html → index.html.
function indexHtml() {
  return {
    name: 'manage-index-html',
    closeBundle() {
      const from = resolve(OUT, 'manage.html');
      if (existsSync(from)) renameSync(from, resolve(OUT, 'index.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), indexHtml()],
  base: './',
  // The harness client's public/ (icons, manifest) is not part of this app.
  publicDir: false,
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: {
      input: 'manage.html',
    },
  },
});
