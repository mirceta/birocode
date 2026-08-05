# Agent-loop research dossier

How credible external practitioners actually run agentic loops — mined live
from the web, cited, and confronted with this repo's own `autopilot-loops`
framework. Produced by the OpenSpec change `research-informed-loops`; the
dossier is **rolling-latest** (refresh a source file by re-pulling that source,
not by archiving).

## Index

- `sources/` — one document per practitioner or major primary document:
  - `sources/anthropic-building-effective-agents.md`
  - `sources/anthropic-claude-code-best-practices.md`
  - `sources/boris-cherny.md`
  - `sources/peter-steinberger.md`
  - additional `sources/<slug>.md` files from the discovery pass
- `techniques.md` — the synthesized technique catalog (every distinct
  technique, attributed and evidence-rated)
- `adoption-map.md` — every catalog technique confronted with the
  `autopilot-loops` baseline: already-have / worth-adopting (ranked) /
  not-applicable

The dossier is readable in-product: autopilot console → Reference → Research.

## Evidence scale (fixed, three levels)

Every technique claim carries exactly one rating:

| Rating | Meaning |
|--------|---------|
| `demonstrated` | The author shows the actual workflow, code, prompts, or logs — first-hand practice you could replicate from the source. |
| `recommended` | The author advises the technique but does not show it running (guidance posts, best-practice lists). |
| `secondhand` | Reported about someone else, community lore, or commentary by a non-practitioner. Weakest; never dressed up as practice. |

## Citation convention

Every claim in this dossier traces to a cited source — **uncited claims are
not admitted**. A citation is: the source URL plus the retrieval date
(`retrieved YYYY-MM-DD`). Claims that cannot be re-found on the live web are
dropped, not kept from model memory. If a page is unreachable from this box
(paywall, JS-only, dead link), the source file records the failed access and
falls back to alternate coverage of the same material (mirror, transcript),
cited as such.

## Credibility-assessment convention

Every `sources/<slug>.md` opens with an explicit credibility assessment:
who the author is, why they are credible on agentic loops, and whether the
material is first-hand practice or second-hand commentary. Popularity is not
credibility — a viral thread by an unknown author is either excluded or
rated `secondhand`. The assessment is stated, never assumed.

## Search-trail rule

A practitioner section that comes up empty says so explicitly and lists the
queries that were tried, so a later refresh knows what ground was covered.
Empty-handed honesty beats padded findings.
