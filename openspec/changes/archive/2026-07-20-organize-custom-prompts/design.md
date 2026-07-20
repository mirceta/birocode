# Organize Custom Prompts — design

## Context

(Scope revised 2026-07-15 — fixed catalog + categories; see proposal. The groups/reorder
design this file previously held is superseded.)

The surface today, confirmed by code survey:

- **Built-ins** — `BUILTINS` array in `PromptManager.jsx`: 7 entries, texts resolved from
  i18n; `kind: 'sys'` entries swap to a `<key>.legacy` text when the per-repo planning
  system toggle says "Old system". Insert-only.
- **Customs** — `PromptsService` (`%APPDATA%\ClaudeWeb\prompts.json`, global, atomic
  writes) via `GET/POST/PATCH/DELETE /api/prompts`; `PromptsContext` fetches once;
  rendered after the built-ins in one flat `<ul>`. Live library: 15 customs (post-union).
- **Templates** — `{{name}}` placeholders (`promptTemplate.js`); "Use" opens a fill-in
  form. The `use()` path already handles params for any text; only the params *caption*
  is skipped for built-ins.
- **Autopilot** — `AutopilotService` builds the routine label space from
  `PromptClassifier.BuildRoutines(_prompts.List(), mined)`;
  `AutopilotDiscoveryService` also diffs mined drafts against `_prompts.List()`.
  Both read the **store**, not the client built-ins.
- **i18n reality check** — `tr.json` translates built-in *labels* but keeps most prompt
  *texts* in English. So promoting texts into i18n keys does not create a real
  translation burden: texts stay English in both locales, labels get a Turkish caption.

The union of all machines' libraries, de-duplicated by exact text:

| pop-up rows today | of which |
|---|---|
| 7 built-ins | unchanged |
| 4 customs = literal copies of built-in texts (`close.legacy`, `evaluate.legacy`, `docsimplify`, `walloftext`) | collapse into the built-ins they copy |
| 1 custom = wording variant of `understandingapp` ("understanding **local** app") | folded as a dedupe alias |
| 10 customs with distinct texts | promoted to new catalog entries |

**⇒ 17 distinct fixed prompts.**

## Goals / Non-Goals

**Goals:**

- One version-controlled catalog of all 17 proven prompts, shipped with the harness.
- Fixed, assistant-identified categories rendered as a card grid — scannable on a phone.
- Customs demoted to a "New ideas" capture inbox; no duplicate rows for promoted prompts.
- Zero backend change; Autopilot consumers and the store untouched.

**Non-Goals:**

- No user-defined groups, manual reordering, collapsible sections, or quick filter
  (first-draft scope, superseded; may return as later ordering steps).
- No editing of catalog prompts from the UI (they're code — edited via the repo).
- No store migration/deletion (see D4).
- No rewording of promoted texts — they are promoted **verbatim**, even where the wording
  predates OpenSpec (flagged to the user; see Risks).

## Decisions

### D1 — Catalog lives client-side as constants + i18n, like the existing built-ins

New module `client/src/components/chat/promptCatalog.js` exports `CATEGORIES` (5 fixed
`{id, labelKey}`) and `CATALOG` (17 entries `{id, category, emoji, label, text, kind,
aliases?}` where `label`/`text` are i18n keys). This extends the proven `BUILTINS`
pattern (texts in `en.json`/`tr.json`, `sys` entries keep their `.legacy` swap) instead
of inventing a backend catalog + endpoint. "Constants that belong with the harness" =
checked into this repo; the client **is** the harness's UI.
*Rejected:* a C# catalog served over the API — it would buy Autopilot awareness of the
catalog, but costs a new endpoint, label-translation plumbing, and a second built-in
mechanism, none of which this step needs (see D4 for why Autopilot is fine).

### D2 — Categories are fixed constants, five of them

Assistant-identified, version-controlled, not user-editable:

| id | title | members (catalog ids) |
|---|---|---|
| `lifecycle` | Feature lifecycle | kickoff, mergebranch, close |
| `decide` | Plan & decide | evaluate, evaluatestars, archplanning, confidence |
| `understanding` | Understanding & docs | understanding, docsimplify, understandingapp |
| `flow` | Conversation flow | wherewerewe, walloftext, handoff |
| `apps` | Local apps & repo | findwebapps, newlocalapprepo, newappinrepo, rundetached |

Membership is a field on the catalog entry; display order = array order within
`CATEGORIES` / `CATALOG` (version-controlled order, no persistence needed).

### D3 — Grid of cards, not a list

Each section renders its prompts as a responsive CSS grid
(`repeat(auto-fill, minmax(160px, 1fr))` — 2 columns on a phone, more on desktop). A card
= emoji + label + text clamped to 3 lines + actions (Use; Edit/Delete only on customs).
The Prompts tab modal widens to `min(820px, 100%)` (same as the Notes tab) so the grid
breathes on desktop. Params caption now computed for **all** items — catalog templates
(the two "create application" prompts) show their fields and open the fill form on Use,
which the existing `use()` path already supports.

### D4 — Promoted store entries are hidden by text match, not deleted

The pop-up filters out any custom whose normalized text (trim, collapse whitespace,
case-insensitive) equals a catalog text — base, `.legacy`, or an `aliases` entry. The
store keeps all 15 promoted prompts. *Why not delete:*

- `AutopilotService`/`AutopilotDiscoveryService` build the routine label space and the
  mined-draft dedupe from `_prompts.List()`; deleting would silently shrink the
  recommender's vocabulary.
- Rollback to a pre-catalog build just shows the old flat list again — no data event.
- No destructive step against the operator's live library.

The one wording variant ("Serve for me the understanding in the understanding local
app.") is hidden via `aliases` on the `understandingapp` entry. Consequence, accepted: a
store copy edited later (e.g. in the Autopilot Routine-prompts tab) no longer matches and
reappears under New ideas — which is honest behavior for what is then a new prompt idea.

### D5 — Custom prompts = "New ideas" inbox, last section

The customs that survive D4's filter render as a final **New ideas** section (same card
UI + Edit/Delete), followed by the unchanged add/edit form. Empty inbox shows the
existing `prompts.empty` hint. This keeps the requested fast capture path with zero
backend work.

### D6 — Promotion is verbatim; labels curated only where forced

Texts are promoted character-for-character. Labels keep their store wording, with one
exception: the stars variant of "Evaluate the different options we have" gets
"(star ratings)" appended so two cards in one section don't carry identical labels.
New entries are `kind: 'gen'` (same text under both planning systems) — no new `.legacy`
texts are invented.

## Risks / Trade-offs

- [Plans-era wording becomes version-controlled] → three promoted texts still say
  "table in our plan" / reference detached-run phrasing etc.; two of the collapsed dupes
  live on only as `.legacy` variants behind the Old-system toggle. Promoting verbatim is
  the user's explicit call; modernizing the wording is a separate, deliberate edit later.
- [Hidden store copies drift] → covered in D4; drift resurfaces the prompt in New ideas
  rather than hiding the change.
- [17 cards + inbox is still a lot of modal] → mitigated by the grid density and fixed
  category order; if it's still slow to scan, the dropped quick-filter is the natural
  step 2.
- [Two "create application" templates look similar] → kept both verbatim (different
  targets: new sibling repo vs. current repo); the category heading groups them so the
  distinction reads locally.

## Migration Plan

Deploy forward only; no data or API changes. Rollback = old UI over the same store
(flat list returns, nothing lost).

## Open Questions

- None blocking. Deferred: whether the promoted texts should be modernized to OpenSpec
  wording (user decision), and whether Autopilot should learn the catalog as part of its
  label space (only matters if the store copies are ever purged).
