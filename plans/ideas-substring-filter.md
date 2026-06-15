# Ideas filter: substring, not subsequence

> **Status:** SHIPPED — browser-verified on an isolated :5210 instance
> (`verify-ideas-substring-filter.mjs` 9/9: the bug repro — a subsequence-only
> idea is now hidden for query `auth` — plus substring match stays, project-label
> match, multi-word AND, empty-shows-all, clearing restores); **deployed to live
> :5099 & confirmed 2026-06-15, merged to main.** On
> `feature/ideas-substring-filter`, branched from `main` @ `479eb40`
> (2026-06-15). Fixes the filter shipped in
> [ideas-filter-project](ideas-filter-project.md); same shared `IdeasPanel`.

## The problem

The Ideas filter box (Ideas tab **and** the dashboard's pinned Ideas panel — one
shared `IdeasPanel`) uses a **subsequence** match (`fuzzyMatch`,
`client/src/components/ideas/IdeasPanel.jsx:30`): the query's characters only
have to appear **in order**, scattered anywhere in the idea text. So typing
`auth` keeps any idea that happens to contain an `a` … `u` … `t` … `h` in that
order across totally unrelated words. The result feels random — ideas that have
nothing to do with what you typed stay on screen.

## The goal

Filter out an idea **unless the searched term actually appears within it** — a
plain **substring** match. Case-insensitive. If the typed text isn't a
contiguous substring of the idea, the idea is hidden.

## Behaviour

- Case-insensitive **substring** (`includes`) match against the idea text **and**
  its optional `project` label (the current `${text} ${project}` target is fine).
- **Empty query → everything shows** (unchanged).
- **Multi-word query = AND of substrings**: split the query on whitespace and
  require **every** token to appear as a substring somewhere in the idea. So
  `auth bug` matches an idea containing both "auth" and "bug" anywhere, in any
  order — but a single token like `auth` must appear contiguously. (This replaces
  today's "strip all whitespace from the query" behaviour, which only made sense
  for subsequence matching.)
- No change to ranking/ordering (the list isn't sorted by match quality today).

## Where it plugs in

| Concern | File | Change |
|---|---|---|
| The matcher | `client/src/components/ideas/IdeasPanel.jsx` | replace `fuzzyMatch` (subsequence) with a substring-AND matcher; update its comment |
| Caller | same file (`~line 116`) | unchanged call shape — still `match(q, \`${n.text} ${n.project || ''}\`)` |

Frontend-only, one function. No backend, no API, no i18n changes (the placeholder
text stays accurate — it's still a filter box).

## Out of scope

- Match **highlighting** in the results.
- **Ranking** by relevance / match position.
- Fuzzy/typo tolerance — the whole point is to make it literal again.

## Verification

Browser-verified on an isolated :5210 instance per
`docs/claude-web/browser-testing.md` (curl can't see React state):

- An idea that contains the typed term **as a substring** stays; one where the
  term only appears as a **scattered subsequence** is now **hidden** (the bug
  repro — e.g. query `auth` against an idea with no "auth" substring but the
  letters in order).
- Multi-word query keeps only ideas containing **all** tokens.
- Empty query shows everything.
- The `project` label is still searched.
- Same behaviour in both surfaces (Ideas tab + dashboard panel), since it's the
  one shared component. Dashboard test must POST/clean up its own ideas (shared
  `%APPDATA%` store — see the dock-sync/ideas test gotchas).
