# Understanding — Prompt plans in the saved-prompts pop-up

## The goal

Extend the saved-prompts pop-up (the **⚙** button by the chat box) with
**prompt plans**. A *plan* is a **named, ordered list of prompt steps** I work
through in sequence — richer than today's one-off saved prompts.

Each **step** has:
- a short **prompt name** (the step's caption),
- a **details** body (the prompt itself),
- an **expected result**.

I author and edit plans **right there in the pop-up**.

## What we settled on

- **Many named plans**, picked from a list — *not* one global plan.
- Lives **alongside** the existing saved prompts: a **Prompts | Plans tab** in
  the *same* pop-up. It doesn't replace the prompts.
- **Steps are reorderable** — the order is the sequence I'll send them in.
- **Use** on a step drops its text into the composer, and that text includes the
  **expected result**, not just the prompt details.
- Plans are **saved globally**, the same way prompts are today (backend-synced
  JSON, not repo-scoped).
- **Nice-to-have:** paste a `PROMPT / DETAILS / EXPECTED RESULT` block and have
  it split into steps automatically.

## Scope

- **Slice 1 (this branch):** author/edit/delete/reorder plans + their steps, and
  **Use** a single step (drop its composed text into the composer). Plus the
  paste-to-split nice-to-have if cheap.
- **Slice 2 (later, NOT now):** run a whole plan into the **send queue** in order
  automatically. Do not build this yet.

## How I'll build it (mirror the existing prompts feature exactly)

The existing custom-prompts feature is the template (`plans/custom-prompts.md`):

- **Backend** — a new `PromptPlansService` + `PromptPlansController` exposing
  `GET/POST/PATCH/DELETE /api/prompt-plans`, persisted to
  `%APPDATA%\ClaudeWeb\prompt-plans.json` via `AppPaths.DataDir` (atomic write,
  thread-safe, safe-load — same as `PromptsService`). Registered with an
  `AddPromptPlansModule()` DI extension wired in `EmbeddedApi.cs`.
  - Model: `PromptPlan(Id, Name, Steps[])` where
    `PlanStep(Name, Details, Expected)`.
- **Frontend** — a `PromptPlansContext` (mirrors `PromptsContext`), and the
  existing `PromptManager.jsx` modal gains a **Prompts | Plans** tab switch. The
  Plans tab lists plans, lets me pick/author one, edit its steps, reorder them
  (↑/↓), and **Use** a step → composes `<details>\n\nExpected result:\n<expected>`
  into the composer via the existing `onInsert`.
- **i18n** — `plans.*` strings in `en.json` + `tr.json`.
- **Gating** — reuse the existing `customPrompts` Advanced capability (the whole
  pop-up is already Advanced-gated), so no new flag unless needed.

## Assumptions

- The composed text a step inserts = the **details** followed by an
  **"Expected result:"** line with the expected text (so what I send carries the
  expectation). I'll confirm the exact wording in the build and keep it tweakable.
- New endpoint path `/api/prompt-plans` (kebab) to avoid colliding with
  `/api/prompts`.
- Reordering via simple ↑/↓ buttons (no drag-drop dependency), consistent with
  the repo's build-less, dependency-light style.
- Slice 1 ships behind the same Advanced gate and is deployed to live `:5099`
  and browser-verified before I call it done.
