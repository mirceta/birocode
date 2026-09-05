## 1. The app

- [x] 1.1 `client/manage.html` + `client/src/manage/{main.jsx,ManageApp.jsx,manage.css}`:
      providers (Language, UiMode pinned advanced, Dock, MemoryRouter), tabs Arch |
      Ideas | Events, harness label from `/api/arch`, session check via
      `/api/auth/check`, "Open harness" to `<root>/studio` in the top window.
- [x] 1.2 `client/vite.manage.config.js` (base './', outDir `../events-app/manage`,
      input manage.html) + `npm run build:manage`.
- [x] 1.3 Events page: "🏛 Manage ↗" link in the tab bar.
- [x] 1.4 i18n (en + tr).

## 2. Verification

- [x] 2.1 `build:manage` clean; main `vite build` and `dotnet test` untouched-green.
- [x] 2.2 Live, through the proxy path (no harness redeploy): the app loads at
      `/api/localview/<self>/app/events-feed/manage/`, the Arch tab shows the real
      arch state (fleet card, agents strip, conversation), Ideas lists the real
      ideas, Events embeds the feed; tab persists; no page errors.
      DONE 2026-09-05 (check-manage-app.mjs on live, 12/12): served 200 with real arch
      state + label, ideas, embedded feed, tab persistence, no 404s/errors. Folder URLs
      need the static-server directory-index fix (next deploy); index.html URL works now.
- [x] 2.3 Understanding app: add the Management App view to the layer explainer.

## 3. Ship

- [x] 3.1 Commit the built `events-app/manage/` so peers get it by pull; push.

## 4. Optional — harness Management view embeds the app

- [x] 4.1 Dashboard Management layer renders the embed when the self repo is known;
      falls back to the direct mounts otherwise. DONE 2026-09-05: isolated check 13/13
      (embed src → /app/events-feed/manage/, Arch + Ideas inside the frame). Needs the
      next harness deploy to reach live.
