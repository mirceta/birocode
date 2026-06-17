# Understanding — OpenSpec: investigate it and adopt its flow

## Goal
Investigate [OpenSpec](https://github.com/Fission-AI/OpenSpec) and **adopt its spec-driven
flow** into Claude Web's working convention — so each feature carries a **living spec
baseline** ("what the system does today") plus **change proposals as deltas**
(ADDED/MODIFIED/REMOVED, with scenarios), reviewed before code and archived after ship.

## What I've done in this kickoff
- Verified `main` was behind origin by 13 commits; **fast-forwarded it to origin tip** before
  branching, then created **`feature/openspec-flow`**.
- **Investigated OpenSpec**: it's a Node CLI + AI slash-commands with `specs/` (living
  baseline), `changes/<id>/` (proposal + design + tasks + delta specs), and `archive/`
  (folds deltas into the baseline on ship). Commands: `openspec init/list/validate/archive`;
  agent flow `/opsx:propose → /opsx:apply → /opsx:archive`; generates an `AGENTS.md`.
- Added the plan: `plans/openspec-flow.md` + an **Active feature plans** entry in `plan.md`.

## Important flag (per repo convention)
There is already a plan — `plans/spec-baseline.md` (Proposed) — that analyzed OpenSpec and
recommended **borrow one idea, do NOT adopt the tooling** (to avoid a second toolchain / two
sources of truth). Your request goes further ("adopt its flow"), so the new plan **explicitly
supersedes** spec-baseline and I marked it as superseded in the index. The key risk it named —
**two sources of truth drifting from the harness** — is the central thing we must resolve.

## How I think we should proceed (open to your steer)
1. **Calibrate first** — run one throwaway `propose → apply → archive` cycle with the real
   OpenSpec to *feel* the flow before committing.
2. **Decide tooling-vs-convention** — adopt the real `openspec` CLI + `/opsx:*`, or
   reimplement the flow in our existing `plans/*` convention so the harness stays the single
   source of truth.
3. **Adopt** the chosen baseline + delta mechanism; optionally render it in the harness.

## Assumptions
- This kickoff = branch + plan + investigation; the actual adoption is the work to follow.
- Nothing is locked in before the calibration run.
