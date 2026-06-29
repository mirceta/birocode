# Tasks

## 1. Tree + search filter

- [x] 1.1 `FileList.jsx` (`FileTree`/`TreeChildren`) — accept `hideGenerated`; filter out dir entries
      named `bin`/`obj` when on.
- [x] 1.2 `FilesBrowser.jsx` — exclude generated paths (`isGeneratedPath`) from the fuzzy search results.

## 2. Toggle + persistence

- [x] 2.1 `FilesBrowser.jsx` — `hideGenerated` state, default ON, persisted device-local
      (`claudeweb_files_hide_generated`); `toggleHideGenerated`.
- [x] 2.2 Toggle button in a bottom bar next to the zoom controls; pass `hideGenerated` to both
      `<FileTree>` usages (IDE + legacy).
- [x] 2.3 `files.css` — `.files-ide__bottombar` + `.files-ide__filter` styles; zoom bar styling moved
      onto the bottom bar.
- [x] 2.4 i18n `files.hideGeneratedTitle` (en + tr).

## 3. Verify

- [x] 3.1 Frontend build green; i18n JSON valid.
- [ ] 3.2 On a deploy: confirm bin/obj hidden by default in a C# project, toggle reveals them, choice
      persists. (Needs the deployed build.)
