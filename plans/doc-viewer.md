# Docs viewer — browser-grade documentation viewing in-app

> **Status (2026-06-12):** SLICES 1 & 2 DEPLOYED & confirmed in production.
> Slice 2 lives on `feature/doc-viewer-links` (not yet merged to main).
> Slices 3/4 deferred until needed.
> Structured per [doc-principles.md](doc-principles.md).

## Goal

Open one doc and understand everything in one tab. The original request
had four parts; review showed they differ sharply in value-to-risk, so
they ship as independent slices.

**Acceptance benchmark**: the user's `web_flow_exposure_docs/flow.md`
doc set (repo: `...\Prg\agentic-workflows\web-flow-autodev`; the folder
doesn't exist on this machine yet, so synthetic fixtures with the same
shape live in `.preview-test/doc-viewer-fixtures/`).

## Slice 1 — mermaid fidelity (branch `feature/doc-viewer`) — DEPLOYED

The pain that forced diagrams down to bare box titles. Hypothesis:
`securityLevel: 'strict'` in `client/src/components/shared/Mermaid.jsx:11`
disables HTML labels → labels cannot wrap, `<br/>` is escaped; no
flowchart config. Fix: `antiscript` + `flowchart: { htmlLabels: true,
wrappingWidth: 200 }` + `markdownAutoWrap` + overflow-scroll CSS.
Shared component → Plan/Files tabs inherit it (fine: same trusted
content, antiscript still strips scripts).

Done = fixture diagram (3+-line labels, styled subgraph loop) renders
with zero truncation, verified headless per
`docs/claude-web/browser-testing.md`. Frontend-only, no new security
surface.

## Slice 2 — doc navigation (branch `feature/doc-viewer-links`) — DEPLOYED

Working relative links (`./`, in-repo paths, `#anchors`) plus
back/forward history in the **existing Files viewer** — no new tab
unless this proves insufficient. Links to `.md` navigate the viewer;
non-doc files open as today; `http(s)` opens a new browser tab. Reuses
the Plan tab's `resolvePath` approach (`client/src/pages/Plan.jsx:23-34`)
generalized into the shared Markdown component. Stays entirely inside
the current repo boundary — `/api/files` and its no-`..` rule
(`FileService.cs:60`) untouched. i18n en/tr; Playwright check on an
isolated :5200 preview.

## Slice 3 — cross-repo `../` links (DEFERRED)

Resolve `..` beyond the repo root. Deferred because (a) the benchmark
doc set needing it doesn't exist on this machine yet, and (b) the
planned trust boundary ("inside any registered repo") is weaker than it
sounds: `POST /api/repos` accepts absolute host paths **from the web**
(`RepoController.cs:97-103`, per plans/projects-tab.md), so "registered"
is a web-user decision, not an operator one. Before building this,
choose: restrict docs-serving to the Projects Root, or gate
absolute-path registration to the desktop GUI (like IP approval), or
accept and threat-model the single-user reality.

## Slice 4 — local HTML webview (DEFERRED)

Raw-bytes endpoint + sandboxed iframe (`allow-scripts`, never
`allow-same-origin`; relative `src` per `docs/claude-web/proxy.md`).
Deferred: it existed to work around broken markdown — if slices 1+2
land well, the motivation may evaporate. Revisit only if interactive
HTML docs become a real workflow. Shares slice 3's trust-boundary
decision.
