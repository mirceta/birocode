# ideas — delta for fix-ideas-sync-url-guidance

## ADDED Requirements

### Requirement: Sync URL shape guard
The sync configuration API SHALL reject a sync URL that cannot possibly speak the
shared-store contract — anything that is not an absolute `http(s)` URL with a
non-root path — with an error that names the two valid shapes (a harness hub URL
`…/api/notes/hub/<token>` or an Apps Script `…/exec` URL), after applying the
existing scheme normalization. The Ideas sync bar SHALL surface that error inline
at save, and its hint SHALL state that the full board URL is required, not the
harness home page. The rejected URL MUST NOT be persisted.

#### Scenario: Site root is rejected at save
- **WHEN** the user pastes `https://next5.example` (or `next5.example`) as the
  sync URL and saves
- **THEN** the save is rejected with guidance to paste the full hub URL
  (`…/api/notes/hub/<token>`) or Apps Script `…/exec` URL, and the stored
  configuration is unchanged

#### Scenario: Full hub URL still saves
- **WHEN** the user pastes a full hub URL (with or without a scheme) and saves
- **THEN** the configuration is stored (scheme-normalized) exactly as before this
  change

### Requirement: Guided sync endpoint errors
The sync engine SHALL surface a guided error in the sync status when the
configured endpoint answers an HTTP failure status, instead of a raw HTTP client
exception message: 401/403 SHALL say the endpoint refused access and that the
open hub path looks like `…/api/notes/hub/<token>` (a bare harness URL is gated);
404 SHALL say no shared-board endpoint exists at the URL; other failure statuses
SHALL name the HTTP status. These messages MUST NOT contain the configured URL
(it remains a capability secret). Successful HTTP responses continue through the
existing body-envelope parsing unchanged, including Apps Script's always-200
redirect behavior.

#### Scenario: Sync pointed at a gated page
- **WHEN** sync runs against a URL that answers 403 (e.g. a harness page behind
  the IP gate)
- **THEN** the sync status shows an error explaining the URL is not the open hub
  path and what the hub URL looks like, and the URL itself appears in neither the
  status message nor the logs

#### Scenario: Sync pointed at a dead path
- **WHEN** sync runs against a URL that answers 404
- **THEN** the sync status says there is no shared-board endpoint at the
  configured URL
