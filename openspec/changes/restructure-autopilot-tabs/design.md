## Context

`AutopilotConsole.jsx` renders a flat 10-button `ap-tabs` nav plus one big
conditional body. Four of the views (Prompt library, Live feed, History, Audit)
are inline JSX in the console; the rest are child components (`AgentsView`,
`LoopsView`, `SystemTestsView`, `ChatArchitectureView`,
`AutopilotArchitectureView`, `AutopilotOverviewView`). `LoopsView` internally
stacks two unrelated sections (recipes, per-agent loops). The console is rendered
by two hosts — `pages/Autopilot.jsx` and the dashboard dock's
`AutopilotPanel.jsx` — via the single `AutopilotConsole` implementation. The
operator gate already splits rendering into "Overview always" vs "everything else
fenced". The audit API already returns `outcome` per entry (`"sent"` from the
suggestion engine, `"loop"` from loop resends); the current Audit view hardcodes
a `sent` badge.

## Goals / Non-Goals

**Goals**

- Two-level nav: 5 root tabs (Overview, Suggestion-based loop, Goal-based loop,
  Audit, Reference), subtab rows under the two loop roots and Reference.
- Re-home the existing views unchanged; split `LoopsView`'s two sections across
  the Goal-based loop subtabs.
- Audit rows show which driver sent (suggestion vs loop) from the existing
  `outcome` field.

**Non-Goals**

- No view redesign or merging (Live feed + History stay separate views).
- No backend, API, routing, or UiMode capability-map changes.
- No persistence of the selected tab (state stays component-local, as today).

## Decisions

1. **Nav state = `root` + per-root `sub` map** (`useState('overview')` +
   `useState({ suggestion: 'control', goal: 'agents', reference: 'autoarch' })`).
   Returning to a grouped root reopens its last subtab within the session.
   Alternative — a single flat key with computed grouping — rejected: the
   render conditions become stringly and the "open on first subtab" default gets
   awkward.
2. **`LoopsView` gains a `section` prop** (`'agents' | 'recipes'`) instead of
   being split into two files. The file keeps its shared constants and the
   `LoopRow`/`RecipeCard` subcomponents; each subtab renders `<LoopsView
   section=…>` showing the loop-mode intro plus only its section. Alternative —
   two new files — rejected as churn for no isolation gain.
3. **Inline views stay inline.** The console's inline JSX blocks (prompts,
   intercepts, history, audit) just move under the new subtab conditions; no
   extraction. Keeps the diff reviewable and the change honestly "pure
   restructure".
4. **Gate logic unchanged in shape**: Overview renders outside the fence;
   every other root (and its subtabs) renders the existing `ap-gateoff` block
   when gated. The nav rows themselves always render.
5. **Audit kind column reads `e.outcome`**: `loop` → a distinct badge
   ("loop", reusing an existing `out-*` style family), anything else → "sent".
   Frontend-only; the backend already durably records the distinction.
6. **Lazy-load trigger keys on the Prompt library subtab** (was `tab ===
   'prompts'`): load prompts + mined drafts the first time
   `root === 'suggestion' && sub.suggestion === 'prompts'`.
7. **CSS**: one new `ap-subtabs` row style (a lighter sibling of `ap-tabs`);
   existing view styles untouched.

## Risks / Trade-offs

- [Playwright scripts that click flat tab labels ("Loops", "Routine prompts")
  break] → the verify script for this change exercises the new hierarchy; older
  autopilot scripts are one-off e2e helpers, updated only if re-run.
- [Two loop roots both containing an "Agents" list could confuse] → the
  Suggestion-based loop's agent arming lives under **Control** (not named
  "Agents"), so only the Goal-based loop has an Agents subtab.
- [Session-local subtab memory resets on remount (dock open/close)] → accepted;
  matches today's behavior for the flat tab.

## Migration Plan

Frontend-only; ships with the normal build + swap. No data or config migration.
Rollback = revert the commit.

## Open Questions

None.
