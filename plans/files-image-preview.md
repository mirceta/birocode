# Image preview — view image files in the Files tab

> **Status (2026-06-14):** DEPLOYED & CONFIRMED on live :5099 (bf81848); rollback
> disarmed, /api/files/raw live (served a real screenshot.png as image/png).
> Browser-verified (verify-files-image-preview.mjs 5/5 on :5201). On
> `feature/files-image-preview`, NOT yet merged to main. Extends the unified
> Files viewer (after Markdown + HTML) to images — "agent saves a screenshot to
> the repo → view it in Files."

## Problem

The Files viewer renders Markdown and HTML, but image files come back garbled:
`GET /api/files/read` is **text-only** (max 1 MB), so a `.png` can't be shown.
There's no phone-friendly way to view an agent-produced screenshot; the Screen
tab is a *live host-desktop* capture, not a file viewer.

## Goal

`.png/.jpg/.jpeg/.gif/.webp/.svg/.bmp/.ico/.avif` files **render as pictures** in
the Files viewer. The agent saving a screenshot to the repo is then enough — the
user opens it (and can pin it) in Files.

## Design

- **Backend — `GET /api/files/raw?path=`** (new, in `FileController`): streams
  the file bytes with the correct `Content-Type`, **restricted to an image-type
  whitelist** (415 otherwise) so it isn't a general binary download. Reuses
  `FileService.ResolveSafePath` (same traversal guard), 404 if missing,
  `PhysicalFile(fullPath, contentType)`.
- **Frontend** — `Files.jsx` detects an image extension and, instead of the
  text `/files/read`, fetches the bytes via `apiGetBlob('/files/raw')` →
  object URL → passes `imageUrl` to `FileViewer`, which renders `<img>`. An
  `<img src>` can't send `X-Repo-Id`, so the blob-fetch path (as the Screen tab
  does) is required. Object URLs are revoked on change/close/unmount.
- The **5 s poll** re-fetches the blob for images too, so a re-taken screenshot
  refreshes live. **No raw toggle** for images (no text source).

## Security

`/files/raw` only serves whitelisted **image** content-types — it can't be used
to pull arbitrary binaries. SVG is served as `image/svg+xml` but rendered via
`<img>`, which does **not** run embedded scripts (unlike inline SVG), so it's
safe. Same `ResolveSafePath` path-traversal guard as `read`/`list`.

## Decisions

- **Keep the Screen tab** (live desktop capture is a distinct capability).
- Whitelisted images only on `/files/raw` (no arbitrary binary serving yet).
- Poll refreshes images live; no raw toggle for images.

## Implementation

- `FileController.cs`: `Raw` action + image content-type map.
- `Files.jsx`: `isImage`; blob-fetch branch in `loadFile` + the poll; object-URL
  lifecycle; pass `imageUrl` to the viewer.
- `FileViewer.jsx`: render `<img className="file-viewer__img">` when `imageUrl`
  is set; suppress the raw toggle for images.
- `files.css`: image styles (fit width, checkerboard/neutral backdrop).

## Verification

`verify-files-image-preview.mjs`: write a small PNG into the repo, open it in
Files → an `<img>` renders with natural dimensions > 0 (it actually loaded);
`GET /api/files/raw` returns it with `image/png`; the same endpoint 415s for a
non-image (e.g. `plan.md`). Read a screenshot. Clean up the fixture.
