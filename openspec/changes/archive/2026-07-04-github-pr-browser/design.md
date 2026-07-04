# Design: github-pr-browser

## Context

The events-app primary page renders the GitHub section from one board endpoint
(`GET api/status-monitor/board`); `GitHubStatusService` derives the repo list from
registered Repos' `origin` remotes and polls via `gh api graphql` (batched aliases,
60s cache, stale-while-refresh, section-level degradation). The tiles are summary-only.
The operator wants to drill down — repo → open-PR list → single PR — inside the app.

Hard constraint discovered up front: **github.com cannot be iframed**
(`X-Frame-Options: deny` sitewide), so the requested "iframe the PR page" is
technically impossible; the operator was told and the native render below is the
agreed substitute. The events-app is build-less static under the localview proxy
sub-path, so **relative URLs only** and no bundler.

## Goals / Non-Goals

**Goals:**
- Repo tile → in-app open-PR list; PR row → in-app PR detail. Zero Chrome tabs for
  routine "what's open, what state is it in, what does it change" review.
- Credential stays server-side: same `gh`-on-PATH mechanism as `GitHubStatusService`.
- Degradation matches the board: a fetch error paints the panel it belongs to,
  never the page or the board sections.

**Non-Goals:**
- No write operations (merge, approve, comment) — the board remains read-only in v1.
- No full diff/file-content rendering — per-file additions/deletions stats only;
  the "open on GitHub" link covers deep code review.
- No display-mode interactivity: `?display=1` keeps tiles summary-only.
- No repos beyond the derived registered-repo list (no manual repo add).

## Decisions

1. **Native render, not iframe** — forced by `X-Frame-Options: deny` (see Context).
   Alternative considered: a server-side rendering proxy that rewrites github.com
   HTML — rejected as fragile, ToS-questionable, and far more code than rendering
   the API data ourselves.

2. **Two on-demand endpoints, not a fatter board payload.**
   `GET api/status-monitor/github/prs?repo=owner/name` and
   `GET api/status-monitor/github/pr?repo=owner/name&number=N`.
   The board stays a cheap 5s poll; drill-down data is fetched when clicked.
   Per-key cache TTL ~30s (a click-around session shouldn't hammer GitHub;
   a re-click after a merge should refresh quickly). Unlike the board's
   stale-while-refresh, a click past the TTL awaits the fetch — drill-down data is
   click-driven, so fresh-on-click beats instant-but-stale; single-flight per key.

3. **New `GitHubPrService` beside `GitHubStatusService`, sharing the remote-parsing
   regex and `gh` invocation pattern** (extract a tiny shared helper only where it
   falls out naturally). Keeps the board's service single-purpose; avoids cache-key
   complexity leaking into the existing 60s section cache.

4. **Repo allow-list = the derived repo list.** The endpoints reject a `repo`
   parameter that is not in `DeriveRepoList()`'s output (404). The browser can
   never use the harness as an open GraphQL proxy to arbitrary repositories.

5. **PR description rendered as escaped text with minimal formatting** (paragraphs,
   line breaks, autolinked URLs) — not a vendored markdown parser. The body is
   third-party content; escaping-first is the security posture, and `homepage/`-style
   build-less pages have no sanitizer. Alternative (vendor marked + DOMPurify)
   rejected as dependency weight for marginal reading comfort in v1.

6. **UI shape: expandable panel under the tile row for the PR list; the PR detail
   replaces the panel content with a back affordance.** One extra DOM region,
   diff-rendered like the other sections; no routing, no new page — consistent with
   "one surface" from the status-monitor spec. Clicking is ignored in display mode.

## Risks / Trade-offs

- [GraphQL cost: PR detail query is heavier (files, checks, reviews)] → fetched only
  on click, cached 30s, `first:` limits on every connection (files 100, checks 50,
  reviews 30).
- [`gh` rate limits under click-heavy use] → per-key cache + single-flight per key
  (concurrent clicks on the same repo await one fetch).
- [PR body content injection] → escape-first rendering (decision 5); no innerHTML of
  raw body, autolink hrefs constrained to http(s).
- [Board tile markup changes might regress display mode] → display-mode behavior is
  spec-covered; browser-verify both modes before deploy (repo convention).

## Migration Plan

Pure addition (new endpoints + page JS); no config, no data migration. Deploy via
`swap.ps1` as usual; rollback = the dead-man's switch already armed by the deploy.
