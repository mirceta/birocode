## Context

The events-app (`events-app/index.html`) is a single, build-less, self-contained page
served live from the working tree. It already has first-class tab machinery:

- A `.tabbar` (`role="tablist"`) with buttons `#tab-activity`, `#tab-agents`,
  `#tab-github`, each carrying `data-tab="<name>"`.
- Panels `.tabpanel[data-tab="<name>"]`, shown/hidden purely by CSS keyed off
  `body[data-tab]` (a generic rule plus one selector per tab).
- A tabless **display mode** (`body.display`) whose CSS forces every `.tabpanel` visible
  at once (`body.display .tabpanel{display:block !important}`).
- Tab selection resolves as **`?tab=` query param › `localStorage` › default Activity**,
  and display mode skips tab routing.

Sound controls today sit *outside* this system: five loose buttons in `<header>`
(`#snd` device toggle, `#sndcfg` opens a modal, `#hsnd`/`#hmode`/`#htest` host controls),
plus a floating `.sndpanel` modal (`#sndClose`, per-type Choose/Replace/Test/Clear).
All the underlying logic — `soundOn`, `unlockAudio()`, `playCue`, the IndexedDB helpers,
`renderSnd()`, the host cue handlers — is already factored into functions bound to those
element IDs.

## Goals / Non-Goals

**Goals:**
- A fourth first-class tab, **Sounds**, that reuses the existing tab CSS/routing verbatim
  (add `sounds` to the `body[data-tab=…]` rule set and the display-mode inclusion — no
  new show/hide mechanism).
- Relocate the existing controls into `#panel-sounds` as a laid-out section: device
  toggle, the (formerly modal) per-type custom-audio grid inlined, and the host controls.
- Zero behaviour change: keep the same element IDs and the same JS bindings so
  `renderSnd()`, `playCue`, host handlers, and IndexedDB assign/clear all keep working
  by moving markup, not rewiring logic.
- `?tab=sounds` + `localStorage` + display-mode parity with the other tabs.

**Non-Goals:**
- Any change to how cues are chosen, synthesized, stored, or played.
- The **sounds-as-replies-for-events** rules/mapping UI (named as a later, separate order
  of business). This change only leaves visual/structural headroom for it in the tab.
- Host-side per-type cues (still tracked under the sibling `add-event-feed-sounds`
  change's out-of-scope §7.1).

## Decisions

- **Reuse the tab system, don't invent one.** Add a `#tab-sounds` button
  (`data-tab="sounds"`) to the tabbar and a `#panel-sounds .tabpanel[data-tab="sounds"]`
  panel, then extend the two CSS touch-points: the `body[data-tab="sounds"] .tabpanel[data-tab="sounds"]{display:block}`
  selector and (implicitly, via the existing `body.display .tabpanel` rule) display mode.
  The `?tab=`/`localStorage` resolver already handles any `data-tab` value generically, so
  routing needs no special-casing beyond the tab existing.
  *Alternative considered:* a settings drawer/route separate from the tabbar — rejected;
  the user explicitly asked for a first-class tab, and the tabbar already models exactly
  that.

- **Move markup, keep IDs.** Physically relocate the header sound buttons and the
  `.sndpanel` modal's inner content into `#panel-sounds`, preserving `#snd`, `#sndcfg`
  (repurposed or dropped — see below), `#hsnd`, `#hmode`, `#htest`, and the per-type
  slot elements. Because every handler binds by ID, the JS keeps working with no logic
  edits. This is the crux of the "no behaviour change" guarantee.
  *Alternative considered:* rewrite the controls fresh in the panel — rejected; needless
  risk to working, tested behaviour.

- **Retire the modal, inline its body.** The `🎵 Sounds` button (`#sndcfg`) and the
  floating `.sndpanel`/`#sndClose` overlay exist only to open/close the custom-audio
  editor. In a dedicated tab that editor is always visible, so the open/close affordance
  is removed and the panel's inner grid is rendered inline as a section of the tab.
  *Alternative considered:* keep the modal, just add the tab — rejected; leaves the corner
  clutter the change is meant to remove.

- **Section layout inside the tab.** Group into labelled sections — *Device sound*
  (toggle + one-line explainer), *Custom event sounds* (the per-type grid, unchanged),
  *Host cue* (on/off, mode, test) — so the tab reads as a settings dashboard and has an
  obvious empty slot where the future event→sound rules UI will live.

## Risks / Trade-offs

- **[Modal→inline CSS drift]** The `.sndpanel`/`.sndcard` styles assume an overlay
  context (fixed position, shadow, max-height scroll). → Re-home the inner `.sndcard`
  content under plain section styling; drop the overlay-only rules so it flows in-page.

- **[Stale references to removed elements]** JS that shows/hides the modal (`#sndcfg`
  click, `#sndClose` click) becomes dead once the modal is gone. → Remove those specific
  handlers; leave all playback/assign/clear logic untouched. Verify no handler throws on
  a now-absent element at load.

- **[Display-mode double-render]** Display mode force-shows every panel; a tall sound
  section could crowd the one-glance view. → Acceptable — it mirrors how Agents/GitHub
  already appear in display mode; the section is compact.

- **[Tab persistence surprise]** A device whose `localStorage` last selected a removed
  tab is unaffected (Sounds is additive), but first load after the change still resolves
  to the prior tab. → No migration needed; additive tab, default path unchanged.

## Migration Plan

Single-file edit to `events-app/index.html`, served live from the working tree (no build,
no deploy step for the app itself). Refresh `understanding-app/index.html`. Verify
headlessly (tab appears, `?tab=sounds` selects it, controls present and functional,
display mode shows the section). Rollback is a straight `git revert` of the single commit.

## Open Questions

- None blocking. The event→sound **rules** UI is deferred by design, not an open question
  for this change.
