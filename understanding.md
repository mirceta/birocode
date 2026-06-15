# Understanding — a served helper that gets agents' local products exposed right

## What you asked for

Help an agent **expose its web app as a local product on our application**, and
get it right the first time. You proposed building this as **a local app that is
itself purposed toward helping other agents expose their local products
correctly** — and you're right that it's central, not a side-idea.

## What I got wrong, and corrected

I first said the shipped **Exposure check** (`/api/expose/check` + the inline
"Verify exposure" panel) already covers it. It covers the *diagnosis*, but not
what you're after: a **served helper product**. That's different and better —
it dogfoods the exact path and becomes the live "done right" reference. So the
plan is now centered on building it, reusing the probe as the engine.

## The approach

- **Centerpiece:** a small web app the harness serves on the Local tab for the
  **active repo**. It's the tool *and* the proof — to exist it must itself be a
  correctly-exposed local product (dual-stack, `base: './'`, root-serve), so it
  doubles as the reference an agent copies. We serve no local product today;
  this fixes that.
- **Builds on, not rebuilds,** the existing Exposure check probe.
- **Cross-repo:** the helper follows whichever repo is active (a `repoId`-aware
  check), so every agent gets it for its own product.
- **Supporting:** the SSRF port-guard and a canonical serving-model doc now feed
  this tool instead of standing alone.

Detail: [plans/serving-model-clarity.md](plans/serving-model-clarity.md);
the two-paths map + danger surface: [plans/serving-model-paths.md](plans/serving-model-paths.md).

## Open design choice (your call)

How the harness serves one helper across repos — I proposed: one served product,
`repoId`-aware check, following the active repo. Steer me if you'd rather it be
strictly per-repo or built differently.

## Status

**Slice 1 built and fully verified (10/10).** The harness serves the bundled
Exposure Helper (`exposer/`) as its own Local-tab product: a loopback dual-stack
static server (`ExposerHost`) + a read-time self-repo `LocalPort` fallback, so the
existing proxy / Local tab / Exposure check all work with **no frontend changes**.

To verify the fallback happy-path without touching the live store, also added a
`CLAUDEWEB_DATADIR` isolation knob (all stores now resolve through one
`AppPaths.DataDir`). On an isolated preview the end-to-end check is **10/10**:
exposer binds 127.0.0.1 **and** [::1], proxy serves it (200, no-store), relative
asset resolves under the proxy prefix, Exposure check all 6 rules green, embedded
JS runs. The live store was never touched.
