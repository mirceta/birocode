# Agentic Engineering Lab — a personal hub for principles & patterns

> **Status (2026-06-21):** **Slice 1 (MVP) built & deployed to live :5099.**
> The `lab/` build-less SPA + seed data exist; the `lab` synthetic
> `kind:harness` app is registered for the **self repo only** and serves under
> `/api/localview/{repoId}/app/lab/`. Browser-verified on an isolated `:5251`
> preview (all 7 sections render, 7 patterns, methodology markdown, **zero
> console errors / failed requests** — `.preview-test/play.mjs`), then the live
> harness was rebuilt + restarted. **Awaiting user confirmation in-browser**
> (Local tab / dock → "Agentic Engineering Lab"). Not yet merged to main.
> Follow-up: slice 2 (live backend CRUD) is a separate decision.

## Problem

There's no home for the operator's **own learning about agentic engineering**.
Lessons, observations, the patterns currently under test, what's worked and what
hasn't, and the testing methodology all live scattered across chats and memory.
There's no single, browsable, growing place that answers "what have I learned,
what am I testing, and what's my repository of patterns & principles?"

## Goal

A **personal hub** — a living knowledge base inside the Claude Web repo — with:

- **Learned** — settled lessons.
- **Found** — observations/discoveries not yet generalized.
- **Testing** — patterns & principles currently in flight.
- **Bad** — anti-patterns / things that didn't work.
- **Good** — ideas worth keeping.
- **How I test** — the methodology for evaluating a pattern/principle.
- **Repository** — the catalogue of patterns & principles themselves.

## Decision — new local app, not a homepage topic

Build it as its **own build-less local app**, served the way `homepage/` and the
always-on Understanding app are (`/api/localview/{repoId}/app/{appId}/`, see
[multiple-local-apps.md](multiple-local-apps.md)). Rationale:

1. **Audience/purpose differ.** `homepage/` is onboarding doctrine *for agents*;
   this is *the operator's* lab notebook + pattern library.
2. **Data model & cadence differ.** Structured, growing, append-heavy records vs
   the homepage's static topic prose.
3. **Platform already supports it** — multi-app per repo is shipped; the
   Understanding app proves the build-less local-app pattern.
4. **Independent lifecycle** — a journal grows forever; homepage topics freeze.

Fold-into-homepage would only fit a tiny static set of notes; six living
categories + a pattern repository + a testing methodology is its own app.

## Design (proposed — confirm at playback)

- **Folder / appId:** `lab/` at the repo root, appId `lab`, title "Agentic
  Engineering Lab". Entry `lab/index.html`, **relative URLs only** (the proxy
  sub-path rule from `docs/local-exposure-convention.md` /
  `docs/understanding-app-convention.md`). Build-less, self-contained, any
  libraries **vendored** (no CDN, no `node_modules`) — same contract as
  `homepage/`.
- **Layout:** a left nav of the categories above + a **Repository** view;
  each category lists entries; the Repository lists patterns/principles with
  a status (testing / good / bad) so an entry and its verdict cross-link.
- **Data shape (MVP, static):** JSON/Markdown data files under `lab/data/`
  (e.g. `entries.json`, `patterns.json`), loaded by the SPA at runtime via
  relative fetch. An entry: `{ id, kind: learned|found|testing|good|bad,
  title, body(md), tags[], links[], created }`. A pattern:
  `{ id, name, summary(md), status: testing|good|bad, evidence[], related[] }`.
  I add/edit these on request — full git history, **zero backend**.
- **Registration:** register `lab` as a local app for the self-repo the same
  way the Understanding app is wired, so it appears in the Local-tab switcher
  and as a dock button.

## Slices

1. **MVP (static, agent-curated):** the `lab/` SPA + seed data + local-app
   registration; verify it serves on the Local tab and in a dock. *(this branch)*
2. **Live backend CRUD (follow-up, optional):** a small store like Ideas/notes
   (`/api/lab/...` + a json file) so entries/patterns can be added & edited from
   the browser without an agent. Separate decision before building.

## Open questions

- Names: `lab/` / appId `lab` / title "Agentic Engineering Lab" — rename freely.
- Whether to seed with real content now (your existing learnings) or ship the
  shell first and fill it as we go.
- Storage fork: static MVP vs jump straight to backend CRUD (slice 2).
