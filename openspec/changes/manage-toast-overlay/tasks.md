# Tasks — manage-toast-overlay

## 1. Implementation

- [x] 1.1 `toast.js` (pure: makeToast, addToast cap that keeps sticky, showToast bus) + `ToastLayer.jsx` + css (fixed overlay, hover-pause, reduced-motion, a11y)
- [x] 1.2 `OpenAgentNotice` → OPEN_AGENT_EVENT-to-toast translator + layer mount; `openToastOf` in openNotice.js (wording/persistence/link unchanged); in-flow banner + CSS removed

## 2. Verification

- [x] 2.1 `toast.test.mjs` + `openToastOf` cases in `openNotice.test.mjs`; client suite green
- [x] 2.2 Evidence rig `shot-open-harness-toast.mjs`: BEFORE the body jumps 46 px; AFTER 0 px across single/stack/dismiss, overlay fixed + polite, stack keeps the sticky link, hover pauses, × and click dismiss — 7/7, screenshots committed
- [x] 2.3 Bundles rebuilt; openspec validate --strict
