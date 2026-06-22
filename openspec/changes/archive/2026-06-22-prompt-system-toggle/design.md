## Context

The ⚙ custom-prompts pop-up (`client/src/components/chat/PromptManager.jsx`) already
has a top tab bar (Prompts | Plans, from the prompt-plans feature) and holds two
built-in prompts whose text lives in i18n (`feature.kickoffPrompt`,
`understanding.prefillPrompt`). Those two were just retuned to OpenSpec. The harness
runs over many repos, which port to OpenSpec at different times, so the built-in
wording must be selectable per repo.

## Goals / Non-Goals

**Goals:**
- A per-repo **OpenSpec / Old system** selector in the pop-up.
- The two system-specific built-in prompts render the wording for the selected system.
- Choice persists per repository; default OpenSpec.
- Frontend-only; no backend change.

**Non-Goals:**
- Changing the user's own saved prompts/plans (they're system-agnostic).
- Auto-detecting a repo's system (e.g. sniffing for `openspec/`). Explicit toggle only.
- A global/account-wide setting — the unit is the repository.

## Decisions

- **Two i18n variants per built-in prompt.** Keep the existing OpenSpec keys; add
  `*.legacy` siblings (`feature.kickoffPrompt.legacy`, `understanding.prefillPrompt.legacy`)
  carrying the old `plan.md` / `understanding.md` wording. The prefill control picks the
  key by the active system. en + tr.
- **Per-repo state, device-local.** Store the choice in `localStorage` keyed by repo id
  (e.g. `claudeweb_prompt_system:<repoId>`), mirroring existing per-device prefs (zoom,
  layout, Simple/Advanced). No backend; survives reload, scoped per repo. If cross-device
  sync is wanted later, move to a per-repo settings store — out of scope here.
- **Selector placement.** A small segmented control in the pop-up header (distinct from
  the Prompts | Plans tabs, which switch *what list* you see; this switches *which system's*
  built-ins). Advanced-gated like the rest of the pop-up.
- **Default OpenSpec** when no stored choice — the canonical convention; old repos opt
  *down* explicitly.

## Risks / Trade-offs

- **Device-local, not synced.** A repo's choice won't follow the operator to another
  device. Acceptable: it matches every other pref's behavior and avoids backend churn.
- **Drift between the two prompt variants.** Two strings to keep in sync per locale; low
  cost (4 strings total) and they rarely change.
- **"top bar of the application" interpretation.** Implemented as a control in the
  prompts pop-up header, not the app's global nav — matches "modify the custom prompts
  feature." Flag for confirmation at review.
