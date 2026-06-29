# Tasks

## 1. Tree + search filter

- [x] 1.1 `FileList.jsx` (`FileTree`/`TreeChildren`) — accept `hideCsproj`; filter out file entries
      whose name ends in `.csproj` when on (`isCsproj`).
- [x] 1.2 `FilesBrowser.jsx` — exclude `.csproj` paths (`isCsprojPath`) from the fuzzy search results.

## 2. Toggle + persistence

- [x] 2.1 `FilesBrowser.jsx` — `hideCsproj` state, default OFF, persisted device-local
      (`claudeweb_files_hide_csproj`); `toggleHideCsproj`.
- [x] 2.2 Second toggle button in the bottom bar next to the bin/obj toggle; pass `hideCsproj` to both
      `<FileTree>` usages (IDE + legacy).
- [x] 2.3 i18n `files.hideCsprojTitle` (en + tr).

## 3. Verify

- [x] 3.1 Frontend build green; i18n JSON valid.
- [x] 3.2 On a deploy: confirm `.csproj` shown by default, toggle hides them in tree + search, choice
      persists. (Verified on the live deploy.)
