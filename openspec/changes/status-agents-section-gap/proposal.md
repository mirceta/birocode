# Status → Agents: 5 px between fleet-computer sections

## Why

Fleet task af0a297f (the Operator, 2026-10-07): the machine sections on Status → Agents have far
too much vertical space between them.

## What was found (measured on a lab fed with the live fleet, 1500×1000)

The Fleet Status list already uses a 5 px flex gap. The 21 px seen between sections was
**8 + 5 + 8**: `client/src/manage/fileSystem.css` — the File System tab's stylesheet — declares
`.fs__machine { … margin: 8px 0 }` under the same `fs__` prefix Fleet Status uses, and both sheets
live in the one Management bundle, so the File System margin leaked onto every Fleet Status
section (and gave the first one 8 px of extra top space). Eight File System selectors collided
(`.fs`, `.fs__btn`, `.fs__dim`, `.fs__head`, `.fs__machine`, `.fs__mh`, `.fs__note`, `.fs__stale`).

## What changes

The File System tab gets its own prefix (`fsys__`, root `.fsys`) in its two files; nothing in
Fleet Status changes. Result: 5 px between consecutive sections, no extra space above the first,
7 machines visible instead of 6 at 1500×1000. The Overview and Scoreboard subtabs render inside
the same section wrapper, so they get the same 5 px — consistent, and a smaller change than
special-casing one subtab.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement).
- Affected code: `fileSystem.css`, `FileSystem.jsx` (class prefix only); Management bundle.
- Evidence: `.claudeweb-preview/gap/measure.mjs` before/after; screenshots
  `docs/screenshots/status-agents-gap-before.png` / `-after.png`.
