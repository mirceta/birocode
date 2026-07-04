# Design: github-repos-from-pat

## Decision 1 — source of truth is `viewer.repositories`, unioned with the registry

One GraphQL query (`gh api graphql`, same invocation mechanism as the section poll — PAT never leaves `gh`):

```graphql
query {
  viewer {
    repositories(first: 100,
                 affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER],
                 ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER],
                 isArchived: false,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { nameWithOwner }
    }
  }
}
```

The result is unioned (case-insensitive, PAT list first, registry-derived appended) with the existing `origin`-remote derivation. Union — not replacement — because a locally registered repo whose remote the PAT cannot access currently renders an explicit "not accessible" tile, and that signal must survive.

**Cap, stated loudly:** `first: 100` with no pagination. The fleet is ~a dozen repos; if it ever exceeds 100, the least-recently-pushed fall off the board. The cap is logged when hit (`nodes.length == 100`) so it is never a silent truncation.

## Decision 2 — one cached combined list feeds both the tiles and the allow-list

`DeriveRepoList()` becomes the cached combined list with a **5-minute TTL** and stale-while-background-refresh (same shape as the section cache): callers always get an answer immediately; only the very first call after startup blocks on GitHub. Both `Fetch()` (tiles) and `IsKnownRepo()` (PR endpoints' allow-list) read it, so a repo has a tile **iff** its PRs are browsable — one consistent notion of "known repo". Today `IsKnownRepo` re-runs `git config` per request; this change makes the allow-list check a cache hit instead.

## Decision 3 — failure falls back to the local derivation, panel semantics unchanged

If the viewer query fails (gh missing, unauthenticated, timeout, no JSON), the combined list is just the local derivation and the failure is logged — the panel then behaves exactly as before this change, and the failed lookup is retried after a shorter TTL (60 s) rather than the full 5 min. A failure never makes previously-visible fleet repos vanish while a fresh-enough cached list exists; the stale list is served until a refresh succeeds.

## Alternatives rejected

- **Config allow-list (`ExtraGitHubRepos`)** — hand-maintained, drifts from the fleet.
- **Fleet-reported remotes** — requires changing the feed producer on every machine; dark machines drop out; the feed today carries only a display name.
- **Replacing (not unioning) the local derivation** — loses the "registered here but PAT can't see it → explicit not-accessible tile" signal.
