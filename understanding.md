# Editable custom-prompts tab — the recommender's real, user-curated label space

## The goal
You asked (repeatedly) for a **tab where you can edit the custom prompts that
autopilot can recommend**. I previously shipped the read-only cousin: the
recommender drew from auto-mined history and the "Routine prompts" tab only
*listed* mined replies. The understanding-app's own explainer even admits
"manual add / edit / rename is NOT built yet — hand-curation is the next slice."
This task builds that missing slice.

## The decision (recommendable label space)
**Recommendable set = your editable custom prompts** (`PromptsService` /
`prompts.json`, which already has full CRUD + a controller). Mined history is
kept as **drafts**: each mined routine shows a one-click "Add to my prompts" so
curating is fast, but nothing mined is recommendable until you promote it.
Autopilot can therefore only ever send a prompt you explicitly approved — or
escalate.

## What I'll do
1. **Recommender draws from custom prompts** — `AutopilotService` builds the
   brain's label space from `PromptsService.List()` (each preset's `Text` = the
   reply to send; triggers derived from its words + any mined context for a
   matching mined routine), not from mined history directly. Empty list →
   escalate everything (unchanged safety default).
2. **Editable "Routine prompts" tab** — replace the read-only list in
   `Autopilot.jsx` with add / edit / rename / delete wired to the existing
   `/api/prompts` endpoints (`GET`/`POST`/`PUT/{id}`/`DELETE/{id}`). Each row
   editable inline; an "add prompt" affordance at top.
3. **Mined drafts → promote** — keep the mined-routine list as a secondary
   "Suggested from your history" section; each row gets **Add to my prompts**
   (POSTs to `/api/prompts` with the mined text). `★ custom` flag stays so you
   can see which mined replies you've already adopted.
4. **Honesty pass** — update the tab summary + understanding-app explainer so
   they describe what's actually wired (editable set; mined = drafts), removing
   the "not built yet" disclaimer.
5. Build frontend, verify on an isolated port with Playwright, then redeploy to
   live :5099 and you decide keep/rollback.

## Assumptions
- The matcher stays the deterministic word-overlap **stub** (no LLM yet) — this
  task is about the *source* and *editability* of the label space, not the
  matching engine.
- Custom prompts are global (not per-repo), matching `PromptsService`'s existing
  design, so the recommendable set is the same across all agents.
- Reusing the existing prompts store (no new persistence) — the composer's
  preset library and autopilot's recommendable set are the same list.
