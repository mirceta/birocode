# Serving model clarity — a served helper that gets agents' local products exposed right

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16):** **Slice 1 built.** On `feature/serving-model-clarity`
> (branched off main synced with origin/main). The harness now serves the bundled
> Exposure Helper (`exposer/`) as its own Local-tab product via `ExposerHost` (a
> loopback dual-stack static server) + a read-time self-repo `LocalPort` fallback —
> the existing proxy, Local tab, and Exposure check all light up with **zero
> frontend changes**. Verified on an isolated `:5210`/`:5298` preview: exposer
> binds **both 127.0.0.1 and [::1]**, serves at root, relative assets resolve, no
> absolute refs (OS netstat + curl), and it **renders in a headless browser with
> its relative JS executing**, AND (via the `CLAUDEWEB_DATADIR` isolation knob
> below) the **fallback happy-path end-to-end: 10/10** — proxy serves the exposer
> (200, no-store), relative asset resolves under the proxy prefix, Exposure check
> all 6 rules green, embedded JS runs.
>
> **Slice 2 built (2026-06-16):** the **guided exposure flow now lives inside the
> helper** — it runs the existing `/api/expose/check` probe and renders the
> per-rule checklist with the **live contract** (a new single-sourced `Why` field
> on each check), run/re-run, and a **one-click "Fix with an agent"** that
> `postMessage`s its fix prompt up to the harness (`LocalApp` prefills the project
> chat + jumps to the agent; same-origin guarded). Verified **14/14** on an
> isolated preview: API `why` on every rule, guided render (rows + why + all-green
> + fix hidden), the fix button posting on a (mocked) failure, and the bridge —
> foreign-origin ignored, legit message navigates + prefills the composer.
>
> **Slice 3 built (2026-06-16):** the served helper now **follows the active
> repo**. The backend check was already `repoId`-aware (`RepositoryResolver`
> honors `?repo=`/`X-Repo-Id`); the gap was the helper calling it with no repo,
> so it always checked the default (itself). Now the helper reads `?repo=<id>`
> from its own iframe URL and forwards it, and **`LocalApp`'s no-port setup state
> embeds the helper pointed at THAT repo** (`/api/localview/<selfId>/?repo=<active>`),
> replacing the static how-to — so every agent gets the guided contract
> walkthrough for their own product before exposing it. Local tab is already
> Advanced-only (no new UI-mode gate); if the self localview path isn't the
> helper (operator self-port override, e.g. the live store's stale 5305),
> `ProductFrame` degrades to its empty state — no broken iframe. Verified **14/14**
> on an isolated store with a seeded second repo: backend + helper follow
> `?repo=` (RepoB shows 0/6, self all green), and the setup state embeds the
> helper checking the active repo.
>
> **Slice 4 built (2026-06-16) — feature complete.** (1) **SSRF port-guard:**
> `POST /api/repos/{id}/localport` now runs `Services/Repositories/LocalPortGuard.cs`
> — a port pointed at a sensitive loopback service (SSH/SMB/RDP/DB/…) or back at
> the harness/preview port (from `AppConfig`, not hardcoded) is refused with
> **HTTP 409 + `requiresConfirm`** and only set when the caller re-sends
> `confirm: true`; `LocalApp.savePort` surfaces the reason via a confirm dialog
> and retries. Not a hard block — odd dev ports still work, opt-in. (2) **Canonical
> doc:** the helper links (top-window nav) to `plans/serving-model-paths.md`
> (already the two-paths map + danger surface; its SSRF gap is updated to
> "guarded"), opened in the Files viewer via a new `?open=<path>` deep-link.
> Verified **20/20** (incl. a race fix: the deep-link must be the *stable* view,
> not transiently shown then clobbered by plan.md). One gotcha caught + fixed: the
> absolute doc-link href tripped the helper's OWN `relativeAssets` check, so it's
> assigned from JS to keep the dogfood all-green. **Full suite: 10/10 + 14/14 +
> 14/14 + 20/20.**

## Slice 1 verification — resolved (10/10)

The one branch that couldn't be tested against the live store — the fallback
happy path (self-repo Local tab → bundled exposer) — is now fully verified.

**Why it was blocked, and the fix.** Every store (`repositories.json`,
`auth.json`, ...) lives in `%APPDATA%\ClaudeWeb`, and `Environment.GetFolderPath`
ignores the `APPDATA` env var on Windows (known-folder API), so a preview could
not be isolated and always read the live operator's store. That store carried an
explicit (and stale/dead) self-repo port `5305`, which shadowed the fallback. We
chose **Option 2**: route every store through a single `AppPaths.DataDir` that
honors a `CLAUDEWEB_DATADIR` override (see docs/claude-web/self-dev.md). A preview
on an isolated store has a freshly-pinned self repo with no port, so the fallback
fires — verified `10/10`, with the live store never touched.

```mermaid
flowchart LR
    A["Self-repo Local tab<br/>asks: which port?"] --> B{"Operator port set?"}
    B -->|"YES (operator override wins)"| C["Use it<br/>-- verified live"]
    B -->|"NO"| D["Fall back to bundled exposer<br/>-- verified 10/10 on isolated store"]

    style C fill:#bbf7d0,stroke:#16a34a
    style D fill:#bbf7d0,stroke:#16a34a
```

> Aside surfaced during verification: your live store's self-repo port `5305` is
> stale (nothing listens), so the live self-repo Local tab is currently dead.
> Clearing that override would let the fallback serve the exposer there too —
> takes effect on the next live-harness restart. Left for you to do out-of-band.

## The problem we're solving

Help an agent **expose its web app as a local product on our application** —
and get it right the first time, instead of reading docs and hoping. The
harness serves a Repo's Product two ways with inverted threat models; the Local
path (per-repo `/api/localview` proxy, behind login) is the one agents need to
get right, and its contract (dual-stack bind, root-serve, relative URLs) is easy
to miss. Full map + danger surface: [the two serving paths](serving-model-paths.md).

```mermaid
flowchart LR
    agent["Agent's product<br/>on a candidate port"] --> helper["Exposure helper<br/>(served local product)"]
    helper -->|reuses| probe["/api/expose/check<br/>(existing probe engine)"]
    probe --> verdict["Pass / fail per rule<br/>+ one-click agent fix"]
    helper -.->|is itself| ref["a correctly-exposed<br/>reference to copy"]
```

## Centerpiece: the served exposure-helper product

A small web app the **harness serves on the Local tab for whichever repo is
active**. It is the tool *and* the proof:

- **It dogfoods the path.** To exist it must itself be a correctly-exposed local
  product — so it doubles as the live **"done right" reference** an agent opens
  and copies. We currently serve *no* local product of our own; this fixes that.
- **It's the guided front-end** over the existing probe: walks the agent through
  each contract rule, explains it against the live contract, runs the check, and
  one-clicks the **agent-fix task**.
- **It builds on, doesn't rebuild,** the shipped Exposure check
  (`Controllers/ExposeController.cs`, `Services/Expose/ExposeService.cs`,
  `components/expose/ExposeCheck.jsx`). The probe stays the engine; this is the
  served surface around it.

**Key design choice (proposed, steer me):** the helper is one product the harness
serves regardless of selected repo, and it asks the harness to check the *active*
repo (a `repoId`-aware `/api/expose/check`). That keeps it cross-repo — every
agent gets the same helper following its own repo — while still being a genuine
served local product, not just harness chrome.

## Slices (sequenced)

- **Slice 1 — The served helper, exposed correctly.** Stand up the small product
  and have the harness serve it on the Local tab; prove the path end-to-end
  (dual-stack, `base: './'`, root-serve). At this point it's the live reference,
  even before the guided UI. Browser-verify on an isolated port.
- **Slice 2 — Guided exposure flow. ✅ Done.** Inside the helper, wrap
  `/api/expose/check`: per-rule checklist with plain-language explanation + the
  live contract (the `Why` field), run / re-run, and the one-click **agent-fix
  task** (helper → `postMessage` → `LocalApp` prefill+navigate). Verified 14/14.
- **Slice 3 — Follow the active repo. ✅ Done.** The helper reads `?repo=<id>`
  from its iframe URL and the (already `repoId`-aware) check follows it;
  `LocalApp`'s setup state embeds the helper pointed at the active repo. Verified
  14/14.
- **Slice 4 — Supporting safety + doc. ✅ Done.** The **SSRF port-guard**
  (`LocalPortGuard`) on `POST /api/repos/{id}/localport` (refuse-then-confirm for
  sensitive services + `:5099`/`:5200` from `AppConfig`) and the **canonical
  serving-model doc** (`serving-model-paths.md`) the helper links to via the Files
  viewer's new `?open=` deep-link. Verified 20/20.

## Out of scope (for now)

- **Unifying the two serving paths into one** — big, risky re-architecture
  touching the public homepage, the off-box IIS forward, and every Product's
  contract. Parked.
- Flipping the deliberate **ungated `/preview/`** decision
  ([gates.md](../docs/networking/gates.md)) — clarify and warn, don't flip.
