# Git tab — mermaid history graph

> **Status (2026-06-12):** In development on `feature/git-graph` (stacked on
> `feature/git-branches`).

## What and why

A visual commit graph at the bottom of the Git tab: the topology dimension
the numeric rows can't express (what is stacked on what, where origin
pointers sit, where branches diverged). The mermaid engine is ALREADY in the
bundle (Markdown.jsx ships it; a gitGraph chunk builds unused today) — only
the git-history → gitGraph-text translation is new.

## Design

- **Recent window only**: last ~30 commits across the refs that matter
  (HEAD, local+origin base, origin/HEAD-branch, and the filtered
  other-branches). Nobody untangles 500 commits on a phone.
- **Vertical** (`gitGraph TB:`) — phones scroll down, not right.
- Remote refs render as **tags** on their commit (e.g. `origin/main`), local
  branches as lanes. Lane names sanitized to mermaid-safe charset.
- **The known trap, designed for**: mermaid gitGraph replays commands and
  cannot express every DAG. Translation works oldest-first with
  first-parent lane ownership (base claims the trunk first, then HEAD's
  branch, then others); a merge whose second parent isn't the exact emitted
  tip of its lane DEGRADES to a highlighted plain commit instead of a
  render error. Belt and braces: the shared Mermaid component already falls
  back to raw source on any syntax error.
- Backend stays dumb: `GET /api/git/graph` returns structured commits
  (hash, short, parents, refs, subject) — the translator lives in the
  frontend (`gitGraph.js`, pure function), so fixes are dist-rebuild-only.
- `gitGraphView: 'advanced'`; section hidden when the window has <2 commits.

## Verification

`verify-git-graph.mjs` on :5201: fixture with a real merge + pushed refs —
API returns the merge with 2 parents; the section renders an actual SVG
(no mermaid error fallback), lanes + origin tags present. Real-repo sanity:
this repo's history (with PR merge commits) renders as SVG too. Screenshot
read before claiming success.
