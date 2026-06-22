# Tasks

## 1. Server — read-only Cockpit data API

- [x] 1.1 Add `GET ./api/cockpit` to `serve.mjs` — aggregate active changes
      (`openspec list --json`), baseline specs (`openspec spec list --json`), and archived
      changes into one JSON envelope `{ activeChanges, specs, archived, errors }`.
- [x] 1.2 Read archived changes from `openspec/changes/archive/` directly (no CLI exposes
      them): each `YYYY-MM-DD-<slug>` folder → `{ id, date, slug, title }`, title from the
      folder's `proposal.md` first `# ` heading (fallback to slug), newest first.
- [x] 1.3 Add `GET ./api/cockpit/show?id=<name>` — read-only passthrough to
      `openspec show <name> --json`; run `<name>` through the existing `reqName()`
      SAFE_NAME guard; reuse `runExec`. No new entry in the `ACTIONS` (write) whitelist.
- [x] 1.4 Handle cold/empty/error states server-side (no active changes, empty `archive/`,
      `openspec` not on PATH) so the client always gets well-formed JSON (`errors` field).

## 2. Client — the Cockpit tab

- [x] 2.1 `index.html` — add a `Cockpit` nav button to the **Understand** group and a
      `<section class="view" id="view-cockpit">` scaffold (`#ckBody` rendered by `app.js`).
- [x] 2.2 `app.js` — on first activation (lazy via `showView`), fetch `./api/cockpit`;
      render the blocks; wire tab switching consistent with the existing view router.
- [x] 2.3 **In flight** block — active-change cards with a task-completion ring (SVG donut,
      `completedTasks/totalTasks`), `status` pill, and `lastModified`; explicit empty state.
- [x] 2.4 **Shipped** block — archived changes newest-first, ship date + proposal title.
- [x] 2.5 **Living baseline** block — capability cards with requirement counts.
- [x] 2.6 Drill-in — clicking an active change or a capability fetches
      `./api/cockpit/show?id=…` and renders deltas (change) or requirements+scenarios
      (spec) in a detail panel.
- [x] 2.7 **Old → OpenSpec legend** — render the mapping (current/active plans, old/closed
      plan, "what does it do today?", completion) → OpenSpec primitive.
- [x] 2.8 **Change ↔ baseline cross-link** — `serve.mjs` stamps each active change with the
      capabilities its delta specs touch (`touches: [{spec, operations}]`, parsed from
      `changes/<id>/specs/`); `app.js` shows those as op-badged tags on the in-flight card,
      and a "⚠ N in flight" pill (naming the changes on hover) on each baseline capability
      card that an active change is editing. No new endpoint or mutating verb.

## 3. Styling

- [x] 3.1 `styles.css` — cockpit cards, completion ring, lifecycle layout (in-flight →
      shipped → baseline), empty/error states; consistent with the existing Control Room look.

## 4. Understanding app

- [x] 4.1 Overwrite `understanding-app/index.html` with a lifecycle→cockpit companion
      visual (propose → in-flight → archived → folded baseline, and which Cockpit block
      surfaces each).

## 5. Verify

- [x] 5.1 Server-verify the endpoints: `./api/cockpit` returns all three sections with real
      active changes, archived changes, and specs; `./api/cockpit/show` returns JSON for a
      change and a spec, and rejects an unsafe id (400). Render functions also run clean
      against the live payloads (ring, cards, legend, deltas, scenarios, error state).
- [x] 5.2 Browser-verify the live tab (headless Chromium via Playwright): Cockpit tab opens,
      in-flight/shipped/baseline cards render, the change↔baseline cross-link shows in both
      directions (`chat` card pill + forward TOUCHES tags), no console errors. Screenshot reviewed.

## 6. Ship

- [x] 6.1 `openspec validate add-openspec-cockpit --strict` passes.
- [x] 6.2 Merge `feature/openspec-cockpit` into `main`.
- [x] 6.3 `openspec archive add-openspec-cockpit` — fold the delta into the `openspec-cockpit`
      baseline.
