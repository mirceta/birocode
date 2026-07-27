# Organize Custom Prompts — proposal

> **Scope revision (2026-07-15):** the first draft of this change planned user-defined
> groups with manual reordering. The user redirected: the custom-prompt library was a
> *temporary* vehicle until the set of prompts actually used in practice was found — and
> it now has been (a cross-machine union produced 22 pop-up rows). Step 1 of ordering is
> therefore: **promote the found set to fixed, version-controlled built-ins, categorized
> by the assistant, rendered as a grid** — not user-managed groups. Custom prompts remain
> only as a fast capture inbox for new ideas.

## Why

The composer prompts pop-up has proven exceptionally useful and the library has grown
accordingly — after unioning the libraries of all machines it renders 22 rows (7 built-ins
+ 15 customs) as one flat list in insertion order. Finding the right prompt means reading
all of it every time; the surface built for speed has become the slow part. The custom
list has also done its discovery job: the set is now known, so it belongs in version
control with the harness, not in a mutable per-host JSON store.

## What Changes

- **Fixed prompt catalog:** all proven prompts become hard-coded built-ins ("the
  catalog"), shipped with the harness like today's 7 built-ins (i18n texts, insert-only).
  De-duplicated by text, the 22 rows collapse to **17 distinct prompts**: 4 customs were
  literal copies of built-in texts (or of their `.legacy` variants), and 1 was a wording
  variant of the "understanding app" built-in (folded as an alias).
- **Categories + grid:** the Prompts tab renders the catalog as a **card grid under fixed
  category headings** instead of one flat list. Categories are assistant-identified
  constants (5 of them: Feature lifecycle, Plan & decide, Understanding & docs,
  Conversation flow, Local apps & repo), not user-editable — this is deliberately the
  first, cheapest step of ordering.
- **Custom prompts become the "New ideas" inbox:** the add/edit/delete machinery and the
  backend store stay exactly as they are, rendered as a final "New ideas" section — the
  fast way to chart a new prompt idea before it earns promotion into the catalog.
- **Store copies hidden, not deleted:** the 15 already-promoted prompts still sit in
  `prompts.json`; the pop-up hides any custom whose text matches a catalog text, so
  nothing shows twice. The store is left untouched because the Autopilot recommender
  builds its routine label space from it (see design D4) and because it makes rollback a
  non-event.
- **Untouched:** `{{param}}` templates and the fill-in form (now also honored when a
  catalog prompt carries params), the Plans and Notes tabs, the per-repo OpenSpec/Old
  system toggle, the prompts REST API, and the Autopilot consumers.
- **Dropped from the first draft:** user-defined groups, manual reordering, collapsible
  sections, and the quick filter. Fixed categories supersede groups for the found set;
  the rest can return as later ordering steps if the grid alone doesn't suffice.

## Capabilities

### New Capabilities

_None — this organizes the existing prompts capability._

### Modified Capabilities

- `prompts`: requirements added for the fixed categorized catalog (all proven prompts as
  version-controlled built-ins), grid rendering under fixed category headings, hiding of
  store duplicates of catalog prompts, template parameters on built-ins, and the custom
  list's new role as a capture inbox. Existing requirements (editable custom list,
  templates, system toggle) are unchanged.

## Impact

- **Frontend only:** new `client/src/components/chat/promptCatalog.js` (the constants);
  `client/src/components/chat/PromptManager.jsx` (sectioned grid + dupe hiding);
  `client/src/components/chat/chat.css`; i18n `en.json`/`tr.json` (10 new prompt texts +
  labels + 6 section titles).
- **Backend:** none. `PromptsService`, `PromptsController`, and the Autopilot
  discovery/recommender keep working against the unchanged store.
- **Data:** `%APPDATA%\ClaudeWeb\prompts.json` untouched (promoted entries remain, hidden
  in the pop-up by text match).
