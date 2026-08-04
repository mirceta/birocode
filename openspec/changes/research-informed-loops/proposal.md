# research-informed-loops — proposal

## Why

Our autopilot loop framework (suggestion / recipe / goal / queue kinds, briefing,
flags, eval suite) was designed from first principles inside this repo, without
ever surveying how the people who run agentic loops best actually run them.
Meanwhile a substantial public body of practice now exists — Anthropic's own
engineering posts (e.g. "Building effective agents", the Claude Code best
practices guide), Boris Cherny (creator of Claude Code), Peter Steinberger's
extensively documented agent-loop workflows, and other well-respected
practitioners. Before we grow the framework further, we should mine that body of
practice deliberately, so the next loop features are chosen from evidence of
what works for others rather than only from our own intuition.

## What Changes

- **A real research effort, executed as part of this change**: systematic online
  research into agentic-loop practice from credible sources — Anthropic official
  engineering posts and docs, Boris Cherny (talks/interviews/posts on Claude
  Code usage), Peter Steinberger (blog posts on agent workflows), plus other
  widely respected engineers discovered during the sweep (each source's
  credibility must be assessed and stated, not assumed).
- **A committed research dossier** under `docs/research/agent-loops/` — one
  source-cited document per major source or theme (with URLs and retrieval
  dates), plus a synthesized technique catalog: each technique named, described,
  attributed, and rated for evidence strength.
- **An adoption map** that confronts the technique catalog with our existing
  loop framework (the `autopilot-loops` baseline spec): for each technique —
  already-have (and where), worth-adopting (with a sketch of how it would land
  in our engine/UI), or not-applicable (with the reason). The worth-adopting
  entries are ranked and become the seed list for follow-up OpenSpec changes.
- **No engine/UI behavior changes in this change.** Concrete integrations are
  deliberately out of scope here; each worth-adopting technique graduates into
  its own follow-up change (proposal → specify → implement) so adoption
  decisions stay reviewable one at a time. An Understanding app accompanies the
  dossier per repo convention.

## Capabilities

### New Capabilities

- `loop-research`: the committed, source-cited agent-loop research dossier and
  its adoption map — what it must contain, how sources are cited and
  credibility-rated, how techniques are confronted with the existing
  `autopilot-loops` baseline, and how worth-adopting items feed follow-up
  changes.

### Modified Capabilities

<!-- none — this change adds research artifacts and an adoption map only; any
     requirement-level change to autopilot-loops will arrive as follow-up
     changes seeded by the adoption map -->

## Impact

- New docs tree: `docs/research/agent-loops/` (dossier, technique catalog,
  adoption map).
- `understanding-app/` — rolling-latest visualization of the technique catalog
  and adoption map (repo convention for non-trivial explanations).
- Reads the `autopilot-loops` baseline spec (`openspec/specs/autopilot-loops/`)
  for the confrontation step; does not modify it.
- No harness code, API, or UI changes; no deploy needed for this change.
- Follow-up OpenSpec changes (one per adopted technique) are the intended
  output pipeline; they are not part of this change.
