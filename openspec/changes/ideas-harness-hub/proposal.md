# ideas-harness-hub — a harness can BE the shared ideas store

## Why

`ideas-drive-sync` shipped the shared ideas board, but its shared store requires a
**human setup step the user rejected**: deploying a Google Apps Script web app by
hand ("find me an option where you can do everything for me and I don't have to do
anything"). The missing insight: the harness itself is already a public HTTP
endpoint (e.g. `next5.birokrat.si`). Nothing about the sync design requires Google —
the sync client only speaks a tiny GET/POST envelope contract against "some URL".
So let one harness **host** that contract natively, backed by its own ideas board.
Setup becomes: flip "Host on this harness" once, copy the generated URL, paste it
into the other harnesses' existing sync box. Zero third-party accounts, zero
human-deployed scripts.

## What Changes

- The harness gains an optional **hub role**: when enabled, it serves the shared
  ideas store over the SAME wire contract the Apps Script web app speaks
  (`GET ?fn=get` → `{ok, rev, store}`; `POST {baseRev, store}` → CAS with
  `{ok:false, conflict:true, rev, store}` on stale revisions; always HTTP 200,
  errors in the body). The existing `IdeasSyncClient`/`IdeasSyncService` on other
  harnesses work against it **unchanged**.
- The hub's backing store is its **own ideas board** (`NotesService`): a remote
  POST merges into the board via the existing commutative `MergeFrom`; a local edit
  on the hub bumps the revision so pollers converge. No second store, no
  hub-vs-local split-brain.
- Access is a **bearer-capability URL**, same trust model as the Apps Script
  `/exec` link: `/api/notes/hub/{token}` with a generated 256-bit token. The token
  path is exempt from session auth (the token IS the auth); everything else about
  the API stays gated.
- The Ideas sync bar gains a **"Host on this harness"** section: enable toggle +
  the ready-to-paste URL (built client-side from `window.location.origin`, so the
  public hostname needs no configuration) + copy button.
- Pasted sync URLs are **normalized**: a missing scheme gets `https://` prefixed,
  so pasting "next5.birokrat.si/…" works.
- The Apps Script path **remains supported** — the hub is a second implementation
  of the same contract, now the recommended one in the README.

## Capabilities

### Modified Capabilities
- `ideas`: adds hub hosting (serve the shared-store contract from the harness,
  token-gated), local-board backing with revision bumps on local edits, the
  host-on-this-harness UI, and sync-URL scheme normalization. (Delta against the
  in-flight `ideas-drive-sync` spec, same capability.)

## Impact

- **Backend**: new `IdeasHubService` (token + revision store, contract handlers
  serialized under a lock) in `ClaudeWeb.App/Services/Notes/`; hub endpoints in
  `NotesController` (`/api/notes/hub/{token}` ungated-by-session,
  `/api/notes/hub-info` gated); `PasswordAuthMiddleware` exemption for the token
  path; `IdeasSyncConfigStore` URL normalization; DI registration.
- **Frontend**: `IdeasSyncBar.jsx` hub section; i18n (en/tr) + CSS.
- **Storage**: new `%APPDATA%\ClaudeWeb\ideas-hub.json` (`Enabled`, `Token`,
  `Rev`) with the atomic temp+rename write.
- **Docs**: README section rewritten to lead with the hub path; Apps Script
  demoted to the no-always-on-harness fallback.
- **Human setup**: none beyond one toggle + one copy-paste of the generated URL.
