# Tasks — fix-ideas-sync-url-guidance

## 1. Backend

- [x] 1.1 `IdeasSyncConfigStore`: extract normalization into a static
      `TryNormalize(raw, out url, out error)` — scheme prefix first, then reject
      non-absolute/non-http(s) URLs and root-path URLs with the guidance message.
- [x] 1.2 `NotesController.PutSyncConfig`: run the helper before `Update`; answer
      400 `{ error }` on rejection, leaving the stored config untouched.
- [x] 1.3 `IdeasSyncClient`: `GetAsync`/`PostAsync` inspect the response status
      before parsing; 401/403 → hub-path guidance error, 404 → no-endpoint error,
      other non-2xx → `HTTP <code>` error; all as `EndpointResult` envelopes (no
      thrown raw messages, no URL in any message).

## 2. Frontend

- [x] 2.1 `ideas.syncHint` copy (all languages): the FULL board URL is required
      (`…/api/notes/hub/<token>` or Apps Script `…/exec`), not the harness home
      page.

## 3. Verify

- [x] 3.1 Builds: `npm --prefix client run build` + isolated .NET build (never
      the running app's bin).
- [x] 3.2 Isolated-port e2e: root URL → 400 with guidance and config unchanged;
      full hub URL (scheme-less too) → saves; sync against a gated non-hub path →
      status `lastError` carries the hub-path guidance without the URL; sync
      against the instance's own hub URL → reaches `synced`.
- [x] 3.3 `openspec validate fix-ideas-sync-url-guidance --strict`.
