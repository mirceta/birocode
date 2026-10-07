## 1. Build

- [x] 1.1 `fileSystem.css` / `FileSystem.jsx`: prefix `fs__` → `fsys__` (root `.fsys`), removing the leak onto Fleet Status. Management bundle rebuilt.

## 2. Verify

- [x] 2.1 `.claudeweb-preview/gap/measure.mjs` on a lab with the live fleet: gaps 21 → 5 px, first section 216 → 208 px from the top, 6 → 7 machines visible at 1500×1000; sticky filter header unchanged. Full client suite green.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
