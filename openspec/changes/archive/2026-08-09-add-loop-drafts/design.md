## Context

Loop task lists are drafted ad hoc today. The harness already has every piece
this feature composes: a persisted-text-store pattern
(`Services/Autopilot/BriefingRulesStore.cs` — `AppPaths.DataDir` JSON file,
atomic temp+rename write, never-reseed-on-unreadable load), a text GET/PUT
endpoint pair (`AutopilotController` `briefing`), a repo registry with stable ids
(`Services/Repositories/RepositoryRegistry.cs`, exposed via `GET /api/repos`),
a proven agents-call-the-API path (`tests/chat-systest`: `POST /api/auth/login`
with the access code → session cookie → API calls), a console with two-level
navigation (`AutopilotConsole.jsx` root row + `SubTabs`), and a homepage topic
pattern that generates paste-ready prompts from operator-filled forms
(`homepage/assets/systest-topic.js`). The design is deliberately "one more of
each of those".

## Goals / Non-Goals

**Goals:**
- A persistent, shared drafting surface per (registered repo, draft type),
  editable identically by the web UI and by any pasted agent, through one API.
- The agent contract lives in one on-disk doc; the homepage topic only points at it.
- v1 friction floor: plain textareas, explicit Save/Reload, no locking.

**Non-Goals:**
- No structured queue-plan editor, no "push to queue"/"start loop from draft"
  action, no draft → loop-parameter compiler (the natural next change).
- No draft history/revisions (briefing has revisions; drafts v1 does not).
- No concurrent-edit merging — last write wins; Reload is the recovery tool.
- No file-on-disk write path for agents.

## Decisions

- **D1 — Store: one `LoopDraftsStore` JSON file, not per-repo files.**
  `loop-drafts.json` under `AppPaths.DataDir`, shaped
  `{ "<repoId>": { "<type>": { text, savedAt } } }`, following
  `BriefingRulesStore`'s atomic-write and load-guard conventions (minus seeding —
  an empty store is the correct first state, so no seed, and an isolated
  `CLAUDEWEB_DATADIR` instance naturally keeps its own drafts). One file keeps the
  list endpoint a single read. Alternative (a file per repo) buys nothing at this
  size.

- **D2 — API on `AutopilotController` next to `briefing`, session-auth only,
  NOT operator-gated.** `GET /api/autopilot/drafts` (per-repo, per-type
  `{ nonEmpty, savedAt }` map), `GET/PUT /api/autopilot/drafts/{repoId}/{type}`.
  Same D2b rationale as briefing: idea capture with no send path must work
  whenever the harness is reachable; composition into real loops stays gated
  where it already is. Repo ids validate against `RepositoryRegistry`; type
  validates against the closed three-value set; oversized bodies rejected with a
  sane cap (e.g. 256 KB). PUT takes the whole text (the editor and agents always
  write the full draft) and returns the saved stamp.

- **D3 — Agent auth = the existing session flow, credentials filled at paste
  time.** The generated homepage prompt has the operator fill base URL and access
  code into the form (systest-topic pattern: copy stays disabled until required
  fields are filled), and instructs the agent to `POST /api/auth/login` for a
  cookie jar, then GET → edit → PUT. No new auth mechanism, no token minting, no
  localhost bypass (the allowlist deliberately has none). The access code
  travels inside the pasted prompt exactly as systest prompts already work on
  this box.

- **D4 — Frontend: Drafts is a root tab with per-repo `SubTabs`, repo list from
  `GET /api/repos`.** Reuses the existing subtab memory (`pickSub`) so returning
  to Drafts reopens the last repo. Within a repo, a three-way type switcher;
  each type a large textarea + Save + Reload + savedAt stamp; non-empty badges
  on the switcher come from the list endpoint. Explicit save (no autosave)
  because an agent may write the same draft mid-edit; Reload is the deliberate
  "take theirs". Registered `loopDrafts: 'advanced'` in `UiModeContext.jsx`.

- **D5 — Convention doc is the contract, homepage is the pointer.**
  `docs/loop-drafts-convention.md` states the three types' content shapes
  (queue-plan: one self-contained prompt per `---`-separated block; goal: one
  coherent goal statement; freestyle: anything) and the exact HTTP calls with
  curl examples. `homepage/assets/loopdrafts-topic.js` (registered in
  `homepage/index.html`) generates the paste-ready prompt that points at the doc
  — same source-of-truth split as the understanding-app and systest topics.

- **D6 — Delimiter `---` on its own line for queue-plan items.** Matches how the
  prompt-expand popup and markdown habits already chunk text; trivially split
  later by the deferred draft→queue compiler.

## Risks / Trade-offs

- [Last-write-wins can drop a concurrent edit] → Explicit Save/Reload plus
  per-type savedAt stamp make staleness visible; drafts are working notes, not
  records — acceptable for v1. Revisions can be added later inside the same
  store shape.
- [Access code embedded in a pasted prompt] → Already the accepted pattern on
  this box (systest prompts); the code is operator-rotatable from the desktop
  form, and the prompt is generated locally on :5305, never published.
- [Baseline `autopilot-console` spec has drifted from the code (Tests root,
  Loops subtabs)] → The MODIFIED requirement re-states the row as the code
  actually is plus Drafts, so archiving this change also heals the drift.
- [Repo unregistered while a draft exists] → Store keeps the orphan blob; the
  list endpoint only reports registered repos, so the UI hides it and a
  re-registered repo gets its draft back. No deletion cascade in v1.

## Migration Plan

Pure addition: new store file, new endpoints, new tab, new doc, new homepage
topic. No existing data or endpoint changes; deploy/rollback is the standard
`swap.ps1` flow.

## Open Questions

None — cardinality (one per repo+type), agent write path (HTTP only), gate
stance (ungated like briefing), and v1 plain-text shape were all settled with
the operator before this change was scaffolded.
