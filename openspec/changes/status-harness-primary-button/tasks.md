# Tasks — status-harness-primary-button

## 1. Implementation

- [x] 1.1 `AgentDetail`: the open-harness row moves to directly under the identity line, restyled `fs__btn--primary` (handler, tab key, URL, data hooks byte-identical)
- [x] 1.2 `manage.css`: accent-filled ≥44px button on `--mg-accent`, near-black label in the dark scheme, disabled state; all other detail controls untouched

## 2. Verification

- [x] 2.1 `shot-status-harness-button.mjs`: BEFORE (104×24 px, 12 px, fourth row) and AFTER (230×46 px, 14.5 px, first action) in light + dark + 1100 px width
- [x] 2.2 Assertions 7/7: first focusable action, hit-target size, label+icon, every other control smaller, same tab key / URL / focus-not-reload, unknown address still honest, no page errors
- [x] 2.3 Client suite green; bundles rebuilt; openspec validate --strict
