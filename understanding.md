# Understanding — view images in the Files tab

## Goal
Let the Files viewer **render image files** (`.png/.jpg/.jpeg/.gif/.webp/.svg/...`)
as pictures, not garbled text. This unlocks the workflow you described: the agent
saves a screenshot to the repo, and you just open it in the Files tab.

## Why it needs backend work
`GET /api/files/read` is **text-only** (max 1 MB, text) — a PNG comes back
garbled. So we add a binary endpoint and fetch images as blobs.

## How
- **Backend:** `GET /api/files/raw?path=` streams the file bytes with the right
  `Content-Type`, restricted to an **image whitelist** (so it isn't a general
  binary-exfil endpoint). Same path-traversal guard as the other file routes.
- **Frontend:** the Files viewer detects image extensions and shows an `<img>`.
  An `<img src>` can't send the `X-Repo-Id` header, so (like the Screen tab) we
  fetch the blob via `apiGetBlob` and render an object URL. The 5 s poll
  re-fetches it, so a re-taken screenshot updates live. No raw/text toggle for
  images (there's no text source).
- **SVG** is served as `image/svg+xml` but rendered via `<img>`, which does not
  execute embedded scripts — safe.

## Scope decision
- **Keep the Screen tab** — it's live host-desktop capture, a different thing
  from viewing saved image files. (Say the word if you'd rather retire it.)

## Plan
`plans/files-image-preview.md`, branch `feature/files-image-preview`. Backend
`FileController.Raw` + frontend `FileViewer`/`Files.jsx`. Verify a saved PNG
renders in the viewer + the raw endpoint serves images only.
