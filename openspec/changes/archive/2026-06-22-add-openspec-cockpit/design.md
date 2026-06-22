# Design — OpenSpec Cockpit

## Context

The Control Room (`openspec-port-app/`) is a build-less, dependency-free Local app served
by `serve.mjs` on `:5310`, satisfying the three-rule loopback contract. Its Console tab
already drives OpenSpec through a strictly-whitelisted `POST ./api/exec` (server builds the
argv; the client only picks a verb + a sanitised id). The Cockpit reuses that posture —
read-only — and adds no mutating capability.

## Decisions

### One aggregation endpoint, not N client-side exec calls

The Cockpit needs three sources at once. Rather than have the client fire three `./api/exec`
calls and stitch them, the server exposes **`GET ./api/cockpit`** that runs the reads and
returns one JSON envelope:

```
{ activeChanges: [...],   // openspec list --json  → changes[]
  specs:         [...],   // openspec spec list --json
  archived:      [...] }  // server-read archive/ dir (see below)
```

Rationale: fewer round-trips, one place to shape data, and the client stays a pure renderer.
Drill-in is a second read-only route, **`GET ./api/cockpit/show?id=<name>`**, a passthrough
to `openspec show <name> --json`; `<name>` goes through the existing `reqName()` SAFE_NAME
guard before it reaches argv. No new entry joins the `ACTIONS` (write) whitelist.

### Archived changes come from the filesystem, not the CLI

`openspec list` reports **active** changes only; there is no command that enumerates
`archive/`. So the server reads `openspec/changes/archive/` directly: each entry is a
`YYYY-MM-DD-<slug>` folder. Ship date = the date prefix; title = the first `# ` heading of
that folder's `proposal.md` (fallback to the slug if absent). This is a read of files the
app already lives beside — no shell, no mutation.

### Source commands (verified against openspec 1.4.1)

- **Active changes** — `openspec list --json` → `{ changes: [{ name, completedTasks,
  totalTasks, lastModified, status }] }`. Gives task progress computed for us.
- **Baseline specs** — `openspec spec list --json` → `[{ id, title, requirementCount }]`.
  (Emits a deprecation warning on stderr preferring verb-first commands; still functional in
  1.4.1. `openspec list --specs --json` does **not** emit JSON in this version, so we use the
  `spec list` form and isolate it to the server so a future swap is one line.)
- **Drill-in** — `openspec show <id> --json` for both a change (deltas + tasks) and a
  capability (requirements + scenarios); `--type` disambiguates if needed.

### Read-only is a hard line

The Console already owns every mutation (propose/archive/validate). Keeping the Cockpit
strictly read means it can never half-run a destructive verb, and the security story is
unchanged: the only new server surface reads state. The honest-scope note carries over —
the Cockpit *shows* state; CI is still what *enforces* it.

## Risks / tradeoffs

- **Spec-list deprecation** — `openspec spec list` warns it's deprecated. Mitigation: the
  command lives only in `serve.mjs`; swapping to its eventual replacement is one edit, and
  the deprecation is a stderr warning, not a failure.
- **Empty / cold states** — zero active changes, an empty `archive/`, or `openspec` not on
  PATH must each render an explicit empty/error state, mirroring how the Console surfaces a
  missing binary plainly.
