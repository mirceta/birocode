# Prompt plans — named, ordered sequences of prompt steps

> **Status (2026-06-21):** **Slice 1 BUILT & DEPLOYED to live :5099.** Author
> plans + Use a single step (+ paste-to-split) shipped; slice 2 (run a whole plan
> into the send queue, in order) is explicitly deferred. On `feature/prompt-plans`
> (off `main`, contains origin/main). Extends [custom-prompts](custom-prompts.md):
> same ⚙ pop-up (new **Prompts | Plans** tab), same global backend-synced pattern.
>
> Browser-verified on the staged build on an isolated `:5252` instance
> (`.preview-test/prompt-plans-check.mjs`) — create plan, add two steps, reorder
> (↓), **Use** a step → composer holds `details` + `Expected result:` + `expected`,
> modal closes, plan + step order **persist across reload**, the **Prompts tab
> still renders**, **0 console errors**; backend CRUD + reorder confirmed over
> HTTP. The same binaries were swapped to live `run-bin` (deploy.ps1); live health
> 200 and the exact verified bundle is served. Not yet committed/merged.

## Problem

The saved-prompts pop-up ([custom-prompts](custom-prompts.md)) holds **one-off**
prompts. Real work is rarely one prompt — it's a **sequence**: "first ask it to
write its understanding, then scaffold, then write tests, then…". The user wants
to capture that sequence as a reusable, named **plan** and walk through it step by
step, with each step carrying not just the prompt but the **expected result** so
they can check the agent's output against it.

## Goal

Add **prompt plans** to the existing ⚙ pop-up: a **named, ordered list of prompt
steps** the user works through in sequence. Each **step** has a short **name**, a
**details** body, and an **expected result**. Authored/edited in the pop-up,
saved globally like prompts.

## What we settled on (decisions)

- **Many named plans**, picked from a list — *not* a single global plan.
- **Same pop-up**, new tab: a **Prompts | Plans** switch inside the existing
  `PromptManager` modal. Plans live *alongside* prompts; neither replaces the other.
- **Steps are reorderable** — the order *is* the send sequence (↑/↓ controls; no
  drag-drop dependency).
- **Use** on a step prefills the composer with the **composed** text — the
  details **plus** the expected result, not just the details.
- **Global, backend-synced** — same persistence model as prompts (a JSON file in
  `AppPaths.DataDir`, not repo-scoped).
- **Nice-to-have:** paste a `PROMPT / DETAILS / EXPECTED RESULT` block and split
  it into steps automatically.

## Scope

- **Slice 1 (this branch):** CRUD plans + steps, reorder steps, **Use** a single
  step → composed text into the composer. Optional paste-to-split helper.
- **Slice 2 (deferred — do NOT build yet):** "Run plan" — enqueue every step into
  the per-agent **send queue** ([queued-prompts](queued-prompts.md)) in order, so
  the user approves them one after another.

## Design — mirror the prompts feature end-to-end

The custom-prompts feature is the template; build the sibling the same way.

### Backend
- `ClaudeWeb.App/Services/PromptPlans/PromptPlansService.cs` — mirrors
  `PromptsService`: thread-safe, atomic write, safe-load (never reseeds on a bad
  file). Persists to `AppPaths.DataDir/prompt-plans.json`.
  - Model: `PromptPlan(string Id, string Name, IReadOnlyList<PlanStep> Steps)`
    and `PlanStep(string Name, string Details, string Expected)`. Caps mirror
    prompts (name ≤ 80, details/expected ≤ 20 000).
- `PromptPlansController.cs` — `GET/POST/PATCH/DELETE /api/prompt-plans`
  (kebab path; avoids colliding with `/api/prompts`). Create/edit take
  `{ name, steps: [{ name, details, expected }] }`.
- `PromptPlansModuleExtensions.AddPromptPlansModule()` registered in
  `EmbeddedApi.cs` next to `AddPromptsModule()`.

### Frontend
- `client/src/context/PromptPlansContext.jsx` — mirrors `PromptsContext`
  (`usePromptPlans()` → `{ plans, refresh, addPlan, updatePlan, deletePlan }`);
  provider wired in `Layout.jsx` beside `PromptsProvider`.
- `client/src/components/chat/PromptManager.jsx` — add a **Prompts | Plans** tab
  header. The Plans tab: list of plans (pick one), a plan editor (name + ordered
  step rows with ↑/↓/edit/delete), a step form (name/details/expected), and a
  **Use** button per step that calls the existing `onInsert(composed)`.
  - Composed text = `details` + `\n\nExpected result:\n` + `expected` (when an
    expected result is set).
- i18n `plans.*` strings in `en.json` + `tr.json`.

### Gating
- Reuse the existing **`customPrompts`** Advanced capability — the whole pop-up is
  already Advanced-gated, so no new flag.

## Non-goals (slice 1)
- No auto-send / no queue integration (that's slice 2).
- No per-step status tracking / checkboxes.
- No drag-drop reordering (↑/↓ only).

## Verification
- Build frontend + backend; deploy to live `:5099` (self-dev isolated build).
- Browser-verify (Playwright): create a plan, add/reorder steps, **Use** a step →
  the composer holds details + expected result; reload → plan persisted; the
  Prompts tab still works unchanged; 0 console errors.
