## Why

The consumer app's sound configuration is scattered as loose buttons crammed into
the top-right of the header — a `🔇 Device` toggle, a `🎵 Sounds` button that opens a
one-off modal, and three Host controls (`🖥️ Host`, `🔊 Beep/voice`, `🔔 Test host`).
It is cramped, easy to overlook, and offers no room to grow. Sound behaviour is now a
real feature of the app (per-type cues, bring-your-own audio, host voice), so its
settings deserve a proper home rather than a corner overflow.

## What Changes

- Add a **first-class "Sounds" tab** to the events-app tabbar, alongside
  Activity / Agents / GitHub, that renders sound configuration as a proper section
  (dashboard), not a header corner + modal.
- **Relocate the status-quo controls into that tab, unchanged in behaviour:**
  - Device sound on/off toggle.
  - Per-event-type custom audio (Choose / Replace / Test / Clear for `turn.start`,
    `turn.ended`, and the `_default` slot) — today's `🎵 Sounds` modal content,
    inlined into the tab as a section.
  - Host cue controls: on/off, beep-vs-voice mode, and test.
- Wire the tab into the **existing tab machinery**: URL-addressable via `?tab=sounds`,
  remembered per device in `localStorage`, and rendered in display mode like the other
  panels.
- Refresh the **understanding-app** companion to explain the new Sounds tab.
- **No behaviour change** to how sounds are chosen, synthesized, stored, or played —
  this is a surface relocation only.

Explicitly **out of scope** (a separate, later order of business the operator named):
defining **sounds as replies for events** — a rules/mapping UI for choosing which event
`type` triggers which sound. This change only builds the tab and moves today's controls
into it; it deliberately leaves headroom in the tab for that follow-on.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-event-feed`: the requirement for how per-device sound settings are
  **surfaced** changes — from ad-hoc header buttons + a modal to a first-class,
  URL-addressable, persisted **Sounds tab**. The underlying cue-selection, custom-audio,
  and host-cue behaviour requirements are unchanged.

## Impact

- **Code:** `events-app/index.html` only (single build-less, self-contained file):
  new tab button + `tabpanel`, moved control markup, tab-routing/display-mode wiring,
  and the `?tab=sounds` / `localStorage` handling. No new files, no vendored/fetched
  audio, relative URLs only, nothing uploaded or committed.
- **Docs:** `understanding-app/index.html` rewritten (rolling latest) to explain the tab.
- **No API, server, or dependency changes.** Device and host cue behaviour is untouched.
