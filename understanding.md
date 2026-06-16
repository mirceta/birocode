# Understanding — serving model clarity (slice 2: guided exposure flow)

## Goal

Build the **guided exposure flow inside the helper** (the served `exposer/`
product), so an agent opens the Local tab and the helper itself walks them
through getting their product correctly exposed — reusing the existing
`/api/expose/check` probe as the engine (not rebuilding it).

## What I'll do

1. **Backend — one new field.** Add a `Why` (plain-language, contract-anchored
   explanation) to `ExposeService.Check`, populated per rule. This keeps the
   "live contract" single-sourced in the backend (same principle as
   `BuildFixPrompt`), so the helper never carries a stale copy. Rides along the
   existing `/api/expose/check` response automatically.

2. **Helper — the guided UI** (vanilla JS/CSS in `exposer/`, still fully
   relative-URL + root-served so it stays its own "done right" reference):
   - Keep the existing "this page is itself correctly exposed" proof.
   - Add a **Run / re-run exposure check** button that calls
     `/api/expose/check` and renders the per-rule checklist: ✓/✗, label, probe
     detail, the **why** (live contract), and the fix when failing.
   - **One-click "Fix with an agent"**: `postMessage` to the parent harness to
     prefill the project chat + jump to the agent; clipboard-copy fallback when
     opened outside the Local tab (no parent).

3. **Harness bridge** (small): in `LocalApp.jsx`, listen for the helper's
   same-origin `postMessage` and call the existing `prefillProjectChat` +
   navigate — the same one-click path `ExposeCheck.jsx` already uses.

## Assumptions

- The helper is used via the Local tab (same-origin proxy), so `/api/expose/check`
  is reachable and the session cookie flows; a direct load degrades gracefully.
- The existing chrome `ExposeCheck` panel stays — the in-helper flow is the
  served-product surface the plan calls for, not a replacement.
- Following the active repo (`repoId`-aware check) is **slice 3**, not now.

## Status — slice 3 done (14/14)

Slice 3 built and verified on an isolated store with a seeded second repo: the
helper reads `?repo=` and the check follows it (RepoB 0/6, self all green), and
LocalApp's setup state embeds the helper pointed at the active repo. The notes
below describe what was built. Slice 4 (SSRF port-guard + canonical doc) is next.

---

The served helper now checks the **active** repo, not always itself.

- The backend `/api/expose/check` is *already* repo-aware (`RepositoryResolver`
  honors `?repo=`/`X-Repo-Id`). The gap is the helper calls it with no repo, so
  it falls back to the default (self) and only ever checks itself.
- **Helper:** read `?repo=<id>` from its own iframe URL and forward it to the
  check call — so the helper checks whatever repo it's pointed at.
- **Placement:** embed the helper in the **no-port setup state of every repo**
  (checking that repo, via `/api/localview/<selfId>/?repo=<activeId>`), replacing
  the static how-to. That's exactly when an agent needs guidance getting exposed;
  the populated tab (with the existing "Verify" panel) is untouched.
- **Robustness:** the Local tab is already Advanced-only, so no new UI-mode gate.
  If the self repo carries an operator port override (so its localview path isn't
  the exposer), `ProductFrame` degrades to its normal "nothing running" empty
  state — no broken iframe. (Live store's stale self-port 5305 is that case until
  cleared, per the plan.)

Verify on an isolated store **with a second repo** that the helper checks the
repo named in `?repo=`, plus the self repo still all-green.
