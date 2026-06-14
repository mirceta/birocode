import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One build identity per build, used in two places that must agree: baked into
// the bundle as __BUILD_TIME__ (so a running tab knows its own build) and
// written to dist/version.json (so a running tab can ask the server what the
// CURRENT build is). When they disagree, the tab is stale (plans/stale-version-banner.md).
const BUILD_TIME = new Date().toISOString();

// Emits dist/version.json alongside the bundle. Only runs on `vite build`, so
// the dev server has no version.json — the client treats that as "unknown".
function emitVersionJson() {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildTime: BUILD_TIME }),
      });
    },
  };
}

// Dev server proxies /api to the embedded Kestrel backend on :5099.
// Production builds output to dist/, which the backend serves as static files.
export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5099',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
