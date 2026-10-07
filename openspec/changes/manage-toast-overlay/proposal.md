# Transient dashboard messages become overlay toasts — nothing shifts the GUI

## Why

The Operator (2026-10-07, fleet task 6ee431ea): the "harness opened in a new
tab" notification (openspec open-agent-everywhere) rendered between the
Management App's header and body, in the page flow — every click on an agent
badge pushed the whole GUI down 46 px (measured) and pulled it back up when
the line faded. Very annoying, and any future transient message would do the
same.

## What Changes

- One shared toast surface: `showToast()` + a `ToastLayer` mounted once —
  `position: fixed`, bottom-right, pointer-events only on the toasts, so a
  message can never move anything. Toasts stack (cap 5; a burst never pushes
  out a sticky one), a quiet toast auto-evaporates after ~4 s with the clock
  paused on hover, an "×" and click-anywhere dismiss, the entry/exit fade is
  off under prefers-reduced-motion, and the layer is `aria-live="polite"`
  with `role="status"` rows.
- The open-harness notice keeps its exact wording, persistence split and
  fresh-tab link (`openNoticeText` untouched; a new pure `openToastOf` maps
  an outcome to a toast): quiet outcomes fade, the "cannot open: reason" /
  "did not come to the front" family — including every message fix
  open-harness-from-card (card 720b3e0c) added — stays until dismissed.
  `OpenAgentNotice` is now just the OPEN_AGENT_EVENT → showToast translator
  plus the layer mount; the in-flow banner and its CSS are gone.
- Anything else transient can call the same `showToast()`; persistent inline
  reports (provisioning replies, error notes) stay where they are.

## Impact

- Affected specs: `management-app` (ADDED requirement).
- Affected code: `components/shared/toast.js` (pure, tested) + `ToastLayer.jsx`
  + css, `OpenAgentNotice.jsx`, `openNotice.js` (+`openToastOf`), the three
  mounts, dead banner CSS removed.
- Evidence: `client/tests/ui/shot-open-harness-toast.mjs` — before: the body
  jumps 46 px; after: 0 px through single toast, stack and dismissals, 7/7
  assertions, screenshots committed.
