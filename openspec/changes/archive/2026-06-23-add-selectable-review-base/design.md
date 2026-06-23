# Design — selectable branch-review base

## Decisions

### 1. Optional `base` param, auto-detect stays the default
`Review` and `ReviewFileDiff` gain an optional `string? baseOverride`. The controller reads
`?base=` and passes it through. Resolution order inside the service:

1. If `baseOverride` is non-empty **and** validates → use it.
2. Otherwise → today's `DetectBases()` (`main → master → origin/main → origin/master`,
   origin preferred).

This keeps every existing caller (and the no-param URL) behaving exactly as before, and the
auto-detected base remains what the dropdown pre-selects. The `ReviewResult.base` /
`.baseRef` returned to the client always reflect what was *actually* used, so the header text
and the dropdown selection stay truthful.

### 2. Validation — exist-check, reject option-like refs
A chosen base is attacker-irrelevant here (local Operator) but still untrusted input that is
spliced into git args. Before use:

- Reject if it is empty, starts with `-`, or contains whitespace / `..` / control chars.
- Confirm it resolves: `git rev-parse --verify --quiet <ref>^{commit}`.

On failure the review endpoint returns **400** with a clear message (`unknown base branch`),
rather than silently falling back — a wrong base picked from the dropdown should be visible,
not papered over. (The *absent* param path still falls back to auto-detect; only an explicit,
bad param is an error.)

### 3. `review/bases` is its own endpoint, not `branches`
`GET /api/git/branches` returns *other* local branches minus the current and base, decorated
with four ahead/behind counts and upstream state — it is the branch-switcher's data, not a
base picker's. The picker needs: local heads + `origin/*`, the current branch usable as a base
too (e.g. comparing a sub-branch to its parent), and a flag for which one is the auto-detect
default. A dedicated `GET /api/git/review/bases` keeps both call sites simple and avoids
overloading `branches` with picker concerns.

Shape:
```jsonc
{
  "default": "origin/main",          // what auto-detect would choose (may be null)
  "bases": [
    { "ref": "origin/main", "kind": "remote" },
    { "ref": "main",        "kind": "local"  },
    { "ref": "develop",     "kind": "local"  }
  ]
}
```
`ref` is the exact string passed back as `?base=`. Listing is cheap: `git for-each-ref
--format=... refs/heads refs/remotes/origin`, excluding `origin/HEAD`.

### 4. Persistence is device-local, per repo
The chosen base is a review *preference*, not repo state, and the codebase already keeps such
prefs on the device (e.g. last-opened file). Store as `localStorage` keyed by repo id
(`claudeweb_reviewBase_<repoId>`). On load, if the stored base is still in the `bases` list,
pre-select it; otherwise fall back to `default`. Nothing crosses the wire to persist.

### 5. Frontend fetch flow
`BranchReview` already refetches `/git/review` on branch/repo change. Add `base` to that
effect's inputs; thread the selected base into both `/git/review?base=` and
`/git/review/file?path=&base=`. Changing the dropdown clears the per-file expanded-patch cache
(those patches were computed against the old base) and refetches the summary. The bases list is
fetched once per repo alongside the first review load.

## Risks
- **Stale per-file cache after base change** — mitigated by clearing expanded-file state on
  base change (decision 5).
- **Detached HEAD / no branches** — `bases` may be short or `default` null; the dropdown then
  shows whatever exists and the review behaves as today (self-hides when not a feature branch).
