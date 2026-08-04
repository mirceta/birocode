# loop-research — delta for research-informed-loops

## ADDED Requirements

### Requirement: A source-cited agent-loop research dossier is committed

The repo SHALL contain a research dossier at `docs/research/agent-loops/`
capturing how credible external practitioners run agentic loops. The dossier
SHALL cover, at minimum: Anthropic's official engineering guidance (agent
design and Claude Code best-practice posts/docs), Boris Cherny, and Peter
Steinberger, plus any further practitioners the research sweep surfaces as
widely respected. Every source document SHALL cite its origin (URL and
retrieval date) and SHALL state an explicit credibility assessment (who the
author is, why they are credible, first-hand practice vs. second-hand
commentary). Claims in the dossier SHALL be traceable to a cited source —
uncited claims are not admitted.

#### Scenario: A dossier claim traces to its source

- **WHEN** a reader picks any technique claim in the dossier
- **THEN** the containing document names the source with URL and retrieval date, and states the author's credibility basis

#### Scenario: The named practitioners are actually covered

- **WHEN** the dossier is reviewed after the research phase
- **THEN** it contains source documents covering Anthropic official guidance, Boris Cherny, and Peter Steinberger — or, for any of them, an explicit note that no substantive first-hand material was found, with the searches that were tried

### Requirement: A synthesized technique catalog rates evidence strength

The dossier SHALL include one synthesized technique catalog that names each
distinct agentic-loop technique found across the sources, describes it
concretely (what the practitioner actually does, not a paraphrased slogan),
attributes it to its source document(s), and rates its evidence strength on a
stated scale that at least distinguishes: demonstrated first-hand practice,
recommended by the author without a shown workflow, and second-hand/anecdotal.
The catalog SHALL NOT contain techniques invented during synthesis — every
entry traces to at least one dossier source.

#### Scenario: Catalog entry is concrete and attributed

- **WHEN** a reader opens any catalog entry
- **THEN** it states the technique's mechanics, links the dossier source document(s) it came from, and carries an evidence-strength rating from the stated scale

#### Scenario: Hearsay is not dressed up as practice

- **WHEN** a technique is known only from second-hand commentary
- **THEN** its entry carries the weakest evidence rating and says so, rather than presenting it as demonstrated practice

### Requirement: An adoption map confronts the catalog with the existing loop framework

The dossier SHALL include an adoption map that confronts every catalog
technique with the harness's existing loop framework (the `autopilot-loops`
baseline spec and its shipped surfaces). Each technique SHALL be classified as
exactly one of: **already-have** (naming the existing requirement or feature
that embodies it), **worth-adopting** (with a sketch of how it would land in
the engine/UI and a rank among the worth-adopting entries), or
**not-applicable** (with the reason). The ranked worth-adopting list SHALL be
phrased so each entry can seed a follow-up OpenSpec change; this change itself
SHALL NOT alter engine or UI behavior.

#### Scenario: Every technique lands in exactly one bucket

- **WHEN** the adoption map is reviewed against the technique catalog
- **THEN** every catalog technique appears in the map exactly once, classified as already-have, worth-adopting, or not-applicable, with the classification's required detail present

#### Scenario: Already-have claims point into the baseline

- **WHEN** a technique is classified already-have
- **THEN** the map names the concrete existing feature or `autopilot-loops` requirement that covers it, so the claim is checkable

#### Scenario: Worth-adopting entries are actionable seeds

- **WHEN** the operator picks the top-ranked worth-adopting entry
- **THEN** its map entry sketches where it would land in the harness (engine, dock, console, briefing, or eval) in enough detail to start a follow-up change proposal without re-reading the sources
