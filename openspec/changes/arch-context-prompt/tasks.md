## 1. Implementation

- [x] 1.1 `GET /api/arch` state: `session.transcriptPath` (ProjectsDirectoryFor(home) + sid + .jsonl, null before first arm).
- [x] 1.2 Arch tab header: ⧉ Copy agent prompt button; clipboard prompt with session id, transcript path, API fallback routes; password never embedded; "✓ copied" feedback; execCommand fallback for plain-HTTP LAN pages.

## 2. Verification

- [x] 2.1 `vite build` clean; isolated instance: button renders, clicking it puts the prompt on the clipboard with the real session id and an existing transcript path; the copied text contains no password.
- [x] 2.2 The copied prompt actually works: following only its instructions locates the live arch conversation (file route).
