# research-informed-loops — tasks

## 1. Dossier scaffold

- [x] 1.1 Create `docs/research/agent-loops/README.md` — index, the three-level
      evidence scale (demonstrated / recommended / secondhand), citation
      convention (URL + retrieval date), credibility-assessment convention, and
      the search-trail rule (empty findings list the queries tried)

## 2. Research sweep (live web, per source)

- [x] 2.1 Anthropic official guidance: locate and read the engineering posts and
      docs on agent loops ("Building effective agents", Claude Code best
      practices, and any newer loop-relevant posts); write
      `sources/anthropic-*.md` with citations, retrieval dates, credibility note
- [x] 2.2 Boris Cherny: sweep posts, talks, interviews on how he runs Claude
      Code loops; write `sources/boris-cherny.md` (or the honest empty-note with
      searches tried)
- [x] 2.3 Peter Steinberger: sweep his blog and related material on agent-loop
      workflows; write `sources/peter-steinberger.md`
- [x] 2.4 Discovery pass: find 2–5 additional widely respected practitioners
      writing first-hand about agentic loops; one `sources/<slug>.md` each with
      an explicit credibility assessment (exclude or mark `secondhand` anything
      that fails it)

## 3. Synthesis

- [x] 3.1 `techniques.md` — the synthesized technique catalog: every technique
      named, concretely described, attributed to source files, rated on the
      evidence scale; single-sitting pass over all committed sources for
      dedup and rating consistency
- [x] 3.2 `adoption-map.md` — confront every catalog technique with the
      `autopilot-loops` baseline: already-have (cite the requirement/surface),
      worth-adopting (landing-site sketch + rank), or not-applicable (reason);
      exhaustive and single-bucketed

## 4. Research sub-tab (autopilot console)

- [x] 4.1 `ResearchView.jsx` under `client/src/components/autopilot/` — loads
      `docs/research/agent-loops/` files via `GET /files/read?path=…`, renders
      with `shared/Markdown`; adoption map default, technique catalog + source
      docs pickable within the view; graceful empty state if files are missing
- [x] 4.2 Wire into `AutopilotConsole.jsx`: `research` sub-tab under the
      `reference` root, rendered outside the operator gate (Overview pattern);
      any needed styles in `autopilot.css`
- [x] 4.3 Build frontend and verify with Playwright on an isolated port:
      sub-tab renders the committed adoption map, source doc opens, and the
      view still renders when `/api/autopilot` is gated

## 4b. Interactive explorer (user feedback: match the understanding app)

- [x] 4b.1 `docs/research/agent-loops/techniques.json` — the structured
      technique catalog (id/name/section/evidence/bucket/rank/gist/sources/
      verdict) committed as part of the dossier, single source the console
      explorer fetches live
- [x] 4b.2 Rework `ResearchView.jsx`: interactive explorer as the default view
      (stats strip, bucket + evidence filter pills, search, ranked
      worth-adopting ladder, technique card grid, slide-in detail panel with
      source pills that open the source docs); prose documents stay pickable
      behind the Documents pills; explorer-specific empty state when
      `techniques.json` is missing
- [x] 4b.3 Explorer styles in `autopilot.css` on the console theme variables
      (light/dark), Playwright re-verify on an isolated port

## 5. Understanding app + wrap-up

- [x] 5.1 Understanding app: interactive view of the technique catalog and
      adoption map (rolling-latest `understanding-app/index.html`, build-less,
      relative URLs)
- [x] 5.2 Verify: every dossier claim spot-checks to a live citation; adoption
      map covers 100% of the catalog; `openspec validate --all --strict` passes
- [x] 5.3 Commit on `feat/loop-research-adoption` and present the ranked
      worth-adopting list to the user as the follow-up-change menu
