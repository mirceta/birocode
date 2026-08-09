# research-informed-loops — design

## Context

The harness now has a mature autopilot loop framework: four loop kinds
(suggestion, recipe, goal, queue) with a suggest/drive mode split, a
state-machine parameter panel, situational briefing with an operator-editable
rules list, the flags channel, sent-history/audit disclosure, and a real-agent
eval suite (`tests/loop-eval/`). All of it was designed in-repo, from first
principles. A public body of practice about running agentic loops exists and
has never been consulted: Anthropic's engineering posts ("Building effective
agents", Claude Code best practices), material from Boris Cherny (creator of
Claude Code), Peter Steinberger's extensively documented agent-loop workflows,
and more. This change runs that research for real and lands its output as
committed, source-cited artifacts plus a ranked adoption map against our
baseline — the seed list for follow-up changes.

## Goals / Non-Goals

**Goals:**

- Execute a genuine web research sweep (not a from-memory summary) across the
  named practitioners and whatever additional credible voices the sweep
  surfaces.
- Commit a dossier under `docs/research/agent-loops/` in which every claim is
  traceable: URL, retrieval date, and an explicit credibility assessment per
  source.
- Synthesize a technique catalog with honest evidence-strength ratings
  (demonstrated practice > author recommendation > hearsay).
- Produce an adoption map classifying every technique against the
  `autopilot-loops` baseline (already-have / worth-adopting / not-applicable),
  with worth-adopting entries ranked and actionable as follow-up change seeds.
- Ship an Understanding app view of the catalog + adoption map (repo
  convention).
- Give the dossier a permanent, in-product home: a read-only Research sub-tab
  under the autopilot console's Reference root that renders the committed
  markdown.

**Non-Goals:**

- No loop-engine, API, or loop-behavior changes — each adopted technique
  becomes its own follow-up OpenSpec change. The only UI addition is the
  read-only Research viewer for this change's own deliverable.
- No attempt at exhaustive coverage of the whole internet; the bar is "the
  well-respected practitioners, covered honestly", not completeness.
- No paywalled/private material; publicly reachable sources only.
- No deploy; this change is docs + understanding-app only.

## Decisions

**1. Research is done live on the web, with the search trail recorded.**
The dossier must state what was searched, not just what was found — a
practitioner section that comes up empty says so and lists the queries tried
(the spec makes this a scenario). Rationale: the model's training-data memory
of these posts is exactly the trap this change exists to avoid; live retrieval
with dates makes the dossier auditable and refreshable. Alternative
(write from model knowledge, spot-check links) rejected: unverifiable and
stale by construction.

**2. Dossier layout: one document per source/theme + one synthesis pair.**
`docs/research/agent-loops/sources/<slug>.md` per practitioner or major
primary document (Anthropic posts may warrant one file per post),
`techniques.md` for the synthesized catalog, `adoption-map.md` for the
confrontation, and `README.md` as the index with the credibility scale and
retrieval-date convention. Rationale: per-source files keep citations local
and let a later refresh re-pull one source; the synthesis pair is what the
rest of the repo links to. Alternative (one monolithic document) rejected:
unmaintainable and un-refreshable.

**3. Evidence scale is fixed at three levels.**
`demonstrated` (author shows the actual workflow/code), `recommended` (author
advises it without showing it running), `secondhand` (reported about someone
else / community lore). Chosen because the spec's honesty scenarios need a
scale that is trivial to apply consistently; finer gradations invite
false precision.

**4. Adoption map is exhaustive over the catalog and single-bucketed.**
Every technique appears exactly once as already-have / worth-adopting /
not-applicable. `already-have` must cite the concrete `autopilot-loops`
requirement or shipped surface; `worth-adopting` must sketch the landing site
(engine / dock / console / briefing / eval) and carry a rank. Rationale: the
map is the deliverable the user will act on; forced classification prevents
the comfortable "interesting, someday" pile. Alternative (freeform essay)
rejected: not actionable, not checkable.

**5. Follow-ups are separate changes, seeded by the map.**
The top-ranked worth-adopting entries each become their own
propose→specify→implement cycle. Rationale: adoption decisions deserve
one-at-a-time review by the user; bundling research and engine changes into
one mega-change would make both unreviewable. This is also why the delta spec
has no Modified Capabilities.

**6. The Research sub-tab renders committed files, not hand-written JSX.**
It lands as a sub-tab under the console's existing Reference root
(`AutopilotConsole.jsx` root `reference`), rendered outside the operator gate
like Overview, using `shared/Markdown` + `GET /files/read?path=…` (the
`UnderstandingPanel`/`ArchPlanSection` pattern) over `docs/research/agent-loops/`.
Rationale: the dossier is rolling-latest by design — a file-backed viewer stays
current for free, where hand-written JSX (the existing architecture-view
counter-pattern) would drift from the committed research. The Understanding app
stays the interactive companion but is overwritten by the next explanation; the
sub-tab is the durable home. No new UiMode capability: the autopilot tab is
already advanced-only. Alternative (separate follow-up change just for the
viewer) rejected: heavyweight for a read-only delivery surface of this change's
own artifact.

**7. Research execution may fan out, synthesis may not.**
The sweep can use parallel sub-searches per practitioner/theme, but the
technique catalog and adoption map are written in one sitting from the
committed source documents, so cross-source dedup and rating consistency have
a single author. Rationale: catalog coherence is the product; parallel
synthesis produces incompatible rating judgments.

## Risks / Trade-offs

- **Model-memory contamination** (writing "findings" from training data
  instead of retrieved pages) → every claim needs URL + retrieval date;
  claims that can't be re-found get dropped, not kept from memory.
- **Fetch friction** (paywalls, JS-only pages, dead links from this box) →
  record the failed access in the source file and fall back to alternate
  coverage of the same material (e.g. the author's mirror, talk transcript);
  never substitute an unverified summary.
- **Popularity ≠ credibility** (viral threads by unknown authors) → the
  per-source credibility assessment is mandatory; low-credibility material is
  either excluded or explicitly rated `secondhand`.
- **Adoption-map bias toward what we built** (rating everything
  "already-have" flatters the existing framework) → already-have entries must
  cite the specific requirement/surface, making each claim checkable at
  review.
- **Staleness** (the field moves fast) → retrieval dates on everything and a
  per-source file layout that makes refreshing one source cheap; the dossier
  is rolling-latest, not an archive.

## Open Questions

- How many worth-adopting follow-ups the user wants to pursue immediately
  (the map ranks; the user picks).
- Whether any Anthropic material worth citing exists only as video/talks —
  if so, transcripts are used and cited as such.
