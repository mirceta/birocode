# research-informed-loops — tasks

## 1. Dossier scaffold

- [ ] 1.1 Create `docs/research/agent-loops/README.md` — index, the three-level
      evidence scale (demonstrated / recommended / secondhand), citation
      convention (URL + retrieval date), credibility-assessment convention, and
      the search-trail rule (empty findings list the queries tried)

## 2. Research sweep (live web, per source)

- [ ] 2.1 Anthropic official guidance: locate and read the engineering posts and
      docs on agent loops ("Building effective agents", Claude Code best
      practices, and any newer loop-relevant posts); write
      `sources/anthropic-*.md` with citations, retrieval dates, credibility note
- [ ] 2.2 Boris Cherny: sweep posts, talks, interviews on how he runs Claude
      Code loops; write `sources/boris-cherny.md` (or the honest empty-note with
      searches tried)
- [ ] 2.3 Peter Steinberger: sweep his blog and related material on agent-loop
      workflows; write `sources/peter-steinberger.md`
- [ ] 2.4 Discovery pass: find 2–5 additional widely respected practitioners
      writing first-hand about agentic loops; one `sources/<slug>.md` each with
      an explicit credibility assessment (exclude or mark `secondhand` anything
      that fails it)

## 3. Synthesis

- [ ] 3.1 `techniques.md` — the synthesized technique catalog: every technique
      named, concretely described, attributed to source files, rated on the
      evidence scale; single-sitting pass over all committed sources for
      dedup and rating consistency
- [ ] 3.2 `adoption-map.md` — confront every catalog technique with the
      `autopilot-loops` baseline: already-have (cite the requirement/surface),
      worth-adopting (landing-site sketch + rank), or not-applicable (reason);
      exhaustive and single-bucketed

## 4. Understanding app + wrap-up

- [ ] 4.1 Understanding app: interactive view of the technique catalog and
      adoption map (rolling-latest `understanding-app/index.html`, build-less,
      relative URLs)
- [ ] 4.2 Verify: every dossier claim spot-checks to a live citation; adoption
      map covers 100% of the catalog; `openspec validate --all --strict` passes
- [ ] 4.3 Commit on `feat/loop-research-adoption` and present the ranked
      worth-adopting list to the user as the follow-up-change menu
