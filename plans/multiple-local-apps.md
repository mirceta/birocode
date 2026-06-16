# Multiple local apps per repo — with the Understanding app as the first 2nd app

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): SLICE 1 SHIPPED — Slice 2 next.** On
> `feature/multiple-local-apps`. The multi-local-app platform (data model, proxy,
> Local-tab switcher) is implemented and verified end-to-end (exposure-example on
> :5305 + a throwaway second app on :5306, both switchable). Reframed from the
> earlier "explain-with-diagrams" idea: the headline is a **platform upgrade** (a
> repo can expose more than one local app), and the diagram/explain feature is its
> **first consumer** (Slice 2).

## The problem

Two pressures meet here:

1. **We want a dedicated "Understanding" app** — a surface where, whenever an agent
   explains something, it serves a **diagram** of it instead of a wall of prose.
2. **We refuse to pollute the [local-exposure-example](local-exposure-example.md).**
   That app is deliberately minimal — it teaches Local-tab exposure by *being* a
   tiny correct example. Bolting a diagram engine onto it would wreck that
   single-responsibility cleanliness.

Today a repo can serve **exactly one** local app: `repositories.json` carries a
single `LocalPort`, and the harness proxies `/api/localview/{repoId}/` straight to
`127.0.0.1:{LocalPort}`. So "keep the example minimal **and** add an Understanding
app" is impossible without a platform change.

## The upgrade: more than one local app per repo

Let a repository register **several** local apps, each on its own port, with a
**switcher in the Local tab**. This is a genuine platform capability, useful well
beyond diagrams — many repos run multiple services (frontend + API + admin), and
seeing each in the Local tab is valuable on its own. The Understanding app is just
the first thing we build on top of it.

### Design sketch (to firm up in Slice 1)

- **Data model:** `LocalPort: int?` → a list of apps, e.g.
  `LocalApps: [{ id, name, port, kind }]`, where `kind` is `repo` (a product the
  repo serves) or `harness` (a harness-provided, always-on app — see below).
  Keep the old single-`LocalPort` shape readable as "one app" for **back-compat**.
- **Proxy path:** grows an app segment —
  `/api/localview/{repoId}/{appId}/` — with a default app so existing links keep
  working. The relative-URL contract is unchanged, just one level deeper.
- **Local tab UI:** an app switcher (tabs/dropdown) above the embedded frame; the
  no-app and single-app cases collapse to today's behaviour.
- **Ripple:** the [dock-local-app](dock-local-app.md) row and the Exposure check
  must say *which* app; both currently assume one. Bounded updates.

### Lifecycle — why the Understanding app is harness-provided

A repo-served product is **started on demand** (someone runs it). That's fine for
the exposure-example you open occasionally, but the Understanding app must be **up
whenever an agent explains something** — i.e. most of the time. So it should be a
**harness-provided, always-on** app (`kind: harness`) that simply *appears* as one
of the repo's local apps.

This does **not** reopen the "don't bake apps into the harness" decision we made
for the exposure-example. That objection was specific: the *example* had to be an
authentic, reproducible product. The Understanding app teaches nothing about
exposure — it's a generic utility — so a harness-provided always-on surface is
consistent here. (The renderer is generic; only the *content* is per-repo: the
agent in repo X draws about X.)

## First consumer: the Understanding app (diagram-on-explain)

When an agent explains something non-trivial, it writes a diagram (mermaid / HTML)
that the always-on Understanding app renders, viewable as a second local app in the
tab — while the agent keeps replying in prose. The minimal exposure-example is left
untouched.

### How the agent is driven (the remaining open sub-decision)

The platform decision settles *where the diagram shows* (a local app). What's left
is *how the "draw it" instruction reaches the agent*, and how rich the surface is.
We compared five deliveries; the **served-app** path (**D**) is the one the
multi-app platform now enables and that we're taking — the table is kept to show
why, and what we're trading away.

★ out of 5, **more stars is always better** (for Dev effort / Dev risk / Low
harness impact, more stars = *less* effort / risk / disruption).

| Approach | Dev effort | Dev risk | Nudge reliability | Reuse | Fidelity | Local-app fit | Low harness impact | Total /35 |
|---|---|---|---|---|---|---|---|---|
| A. Convention only | ★★★★★ | ★★★★★ | ★★☆☆☆ ¹ | ★★★★☆ | ★★★☆☆ | ★★½☆☆ | ★★★★★ | 26.5 |
| B. Nudge → doc viewer | ★★★½☆ | ★★★☆☆ ² | ★★★★☆ | ★★★★☆ | ★★★☆☆ | ★★½☆☆ | ★★★☆☆ | 23 |
| C. Nudge → diagram panel | ★★★☆☆ | ★★★☆☆ | ★★★★☆ | ★★★☆☆ | ★★★½☆ | ★★★★☆ | ★★½☆☆ | 23 |
| **D. Nudge → served app ✅** | ★★½☆☆ | ★★½☆☆ ³ | ★★★★☆ | ★★★☆☆ | ★★★★★ | ★★★★★ | ★★☆☆☆ ⁵ | 24 |
| E. Diagram tool | ★★☆☆☆ | ★★☆☆☆ | ★★★★★ ⁴ | ★★☆☆☆ | ★★★★★ | ★★★☆☆ | ★☆☆☆☆ | 20 |

¹ Per-repo and prose-only — not literally every prompt; agents can skip it.
² Touches prompt construction (harness core) — small edit but a central path.
³ A per-repo always-on server + port lifecycle is more moving parts to manage.
⁴ A structured tool call resists being "forgotten" better than a prose nudge, but
needs new tool plumbing.
⁵ The harness-impact cost is now mostly the **multi-app platform** itself (Slice 1)
— but that cost buys a reusable capability, not just this feature.

We chose **D** because it scores best on the two dimensions the feature exists for
(**fidelity**, **local-app fit**), and because the multi-app platform pays down its
weakness (clean separation from the example, no per-app server juggling for the
harness-provided case). **E** stays parked unless prose nudges prove unreliable.

## Slices (sequenced)

- **Slice 1 — Multi-local-app platform. ✅ SHIPPED.** Delivered:
  - **Data model:** `RepositoryConfig.LocalApps: [{ id, name, port, kind }]`; the
    legacy `LocalPort` is read as one app and migrated into the list on first
    mutation (`RepositoryRegistry.EffectiveApps` / `EnsureMigrated`). Back-compat
    consumers still see `localPort` = the default (first) app's port.
  - **Proxy:** `LocalProxyController` grows `…/{repoId}/app/{appId}/{**rest}`; the
    bare `…/{repoId}/{**rest}` stays as the **default (first) app** — so old links,
    the dock, and the Exposure check keep working unchanged (they target the
    default app). The literal `app/` segment outranks the bare catch-all.
  - **API:** `POST /repos/{id}/localapps` (add), `DELETE /repos/{id}/localapps/{appId}`
    (remove); `/api/repos` now returns `localApps`.
  - **Local-tab UI:** an app switcher (one removable chip per app, "+ Add app"),
    embedding `…/{repoId}/app/{appId}/`.
  - **Ripple handled by the default-app rule** (no dock/Exposure-check changes
    needed yet); making *those* surfaces app-aware is a follow-up, not a blocker.
- **Slice 2 — The Understanding app (first consumer).** A harness-provided,
  always-on diagram renderer registered as a second app; the prompt nudge that
  makes the agent write a diagram when explaining; lifecycle (one rolling latest
  diagram vs. small history).

## Open questions

- ~~**Proxy scheme:**~~ **Decided (Slice 1):** `…/{repoId}/app/{appId}/` (a path
  segment, not a query param — relative assets must resolve per-app). The bare
  `…/{repoId}/` is the **first app** in the list (the default), so old links keep
  working. A query param was rejected: it leaves every app sharing one base path,
  so their relative `./assets/…` collide.
- **Nudge delivery:** harness-appended system-reminder at prompt-build time vs. a
  CLAUDE.md convention vs. a tool (A vs. D-style vs. E above).
- **Trigger threshold:** only non-trivial explanations, so we don't diagram
  one-line answers.
- **Diagram format & lifecycle:** mermaid vs. hand-authored HTML/SVG; rolling
  latest vs. history; how it clears.

## Out of scope (for now)

- Auto-generating diagrams *for* the agent — the agent authors them; the app only
  renders/serves.
- A framework "gotcha" sibling demo (carried over from
  [local-exposure-example](local-exposure-example.md)).
