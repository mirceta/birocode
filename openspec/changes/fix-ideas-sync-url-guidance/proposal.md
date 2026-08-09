# fix-ideas-sync-url-guidance — stop the sync bar from accepting URLs that can never sync

## Why

The first real multi-harness setup attempt (2026-08-09, next5.birokrat.si) failed
with an opaque `Response status code does not indicate success: 403 (Forbidden).`
in the sync bar — and the operator reasonably concluded the hub endpoint was still
gated. It wasn't: the hub path was open and serving (verified 200 from the public
internet). The pasted sync URL was the **harness site root** (`https://next5.birokrat.si`)
instead of the full hub URL (`…/api/notes/hub/<token>`), so the sync client was
polling the gated front door and relaying the raw HttpClient exception. Two gaps
made a config mistake look like a shipped-broken feature:

1. The config API saves **any** string as the sync URL — a site root, which by
   construction can never speak the shared-store contract, is accepted silently.
2. The sync client throws on non-2xx responses, so the status chip shows transport
   noise instead of saying "you pasted the wrong URL, here is what the right one
   looks like."

## What Changes

- **Save-time shape guard**: `PUT /api/notes/sync/config` rejects a sync URL that
  is not an absolute `http(s)` URL with a non-root path, answering 400 with
  guidance naming the two valid shapes (`…/api/notes/hub/<token>` or an Apps
  Script `…/exec` URL). The existing scheme-prefix normalization runs first, so
  scheme-less pastes still work. The sync bar already renders the 400 body inline.
- **Status-aware endpoint errors**: `IdeasSyncClient` inspects the HTTP status
  before parsing. 401/403 produce a guided error ("the endpoint refused access —
  the open hub path looks like …/api/notes/hub/<token>; a bare harness URL is
  gated"), 404 a "no shared-board endpoint at this URL" error, other non-2xx a
  plain `HTTP <code>` error — all flowing into the existing `lastError` status
  surface instead of a thrown raw exception message. Apps Script responses
  (always HTTP 200, often via redirect) are unaffected.
- **Hint copy**: the sync bar hint states explicitly that the FULL board URL is
  required, not the harness home page.

## Capabilities

### Modified Capabilities
- `ideas`: the link-configured shared store gains a sync-URL shape guard at save
  and guided (instead of raw) errors when the configured endpoint answers with an
  HTTP failure status.

## Impact

- **Backend**: `IdeasSyncConfigStore` gains a normalize+validate helper;
  `NotesController.PutSyncConfig` uses it; `IdeasSyncClient.GetAsync/PostAsync`
  check `HttpResponseMessage.StatusCode` and return error envelopes (no URL ever
  appears in the messages — it stays a capability secret).
- **Frontend**: `ideas.syncHint` copy (en/sl); no component changes — `saveError`
  and `status.lastError` rendering already exist.
- **No wire/storage changes**: config file shape, hub contract, and status API are
  untouched.
