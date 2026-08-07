# Tasks — ideas-harness-hub

## 1. Backend hub

- [x] 1.1 `IdeasHubStore`: `%APPDATA%\ClaudeWeb\ideas-hub.json` (`Enabled`, `Token`,
  `Rev`) — atomic temp+rename save, tolerant never-reseed load, token generated
  (32 random bytes, base64url) on first enable, rev persisted monotonic
- [x] 1.2 `IdeasHubService`: contract handlers under one lock — `Get()` →
  snapshot + rev; `Post(baseRev, store)` → CAS check, `MergeFrom`, rev++ +
  persist, conflict envelope on stale rev; subscribes to `NotesService.Changed`
  to bump rev on hub-local edits; DI registration
- [x] 1.3 `NotesController`: `GET/POST /api/notes/hub/{token}` (token checked
  constant-time; wrong token / disabled → 200 `{ok:false, error}`; envelope shape
  identical to `docs/ideas-sync-appscript.gs`); `GET/POST /api/notes/hub-info`
  (gated: `{enabled, token}` / `{enabled}` toggle)
- [x] 1.4 `PasswordAuthMiddleware`: exempt `/api/notes/hub/` prefix (GET+POST);
  `IdeasSyncConfigStore.Update`: prefix `https://` when the pasted URL has no scheme

## 2. Frontend

- [x] 2.1 `IdeasSyncBar.jsx`: "Host on this harness" section in the expanded form —
  toggle, generated URL (`window.location.origin + '/api/notes/hub/' + token`),
  copy button; i18n (en/tr) + CSS

## 3. Verify

- [x] 3.1 Two-instance isolated e2e (`verify-ideas-hub.mjs`, patterned on
  `verify-ideas-sync.mjs`): A hosts, B syncs to A's hub URL — add on B appears on
  A's board and vice versa; hub-local edit propagates (rev bump); delete carries;
  forced stale-rev POST answers conflict and the retry lands; wrong token and
  disabled hub answer error envelopes; self-pointing harness is a harmless no-op
- [x] 3.2 Playwright: enable hub in the sync bar UI, copy URL renders under the
  browsing origin
- [x] 3.3 `openspec validate ideas-harness-hub --strict`

## 4. IP-gate exemption (added after ship: the guest-list wall blocked remote syncers)

- [x] 4.1 `IpFilterMiddleware`: serve `GET`/`POST` `/api/notes/hub/{token}`
  (segment-matched, `hub-info` stays gated) to any IP — the single deliberate
  exception to the no-exemptions rule; update the middleware + controller doc
  comments and the access-control delta spec
- [x] 4.2 E2e: instance with an EMPTY guest allowlist — `/api/health` and
  `/api/notes/hub-info` answer 403, hub GET/POST complete the contract, wrong
  token still gets only the error envelope

## 5. Docs + wrap-up

- [x] 5.1 README: rewrite "Sharing the Ideas board between machines" to lead with
  the hub path (toggle + paste); Apps Script demoted to fallback; note the
  bearer-URL trust model
- [x] 5.2 Understanding app honesty pass + commit on `feat/ideas-drive-sync`
