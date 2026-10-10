# Tasks — model-free-text

## 1. Implementation

- [x] 1.1 `claude-opus-5-5` ("Opus 5.5") in the catalogue, after the Fables, before Opus 4.8
- [x] 1.2 `ModelSelector`: Custom group (recent ids + "Custom model id…" → input), shape-only validation, stray current value shown as-is; `isValidModelId` + `rememberCustomModel` pure in models.js; css + i18n (en/tr)
- [x] 1.3 Arch model setting: same component, default and Claude-only rule untouched; no server change (ModelBelongsTo already passes unknown ids through)

## 2. Verification

- [x] 2.1 models.test.mjs: Opus 5.5 presence/order/label, id shape rules, recent-list dedupe/cap; client suite green
- [x] 2.2 Evidence rig `shot-model-picker-custom.mjs` 8/8: list order, custom reveal, invalid blocked, typed id posted + persisted + re-pickable after reload, arch default untouched; screenshots committed
- [x] 2.3 Real CLI on this machine: `claude --model claude-opus-5-5 -p` → "ok" (CLI updated 2.1.278 → 2.1.295, which the old version's own error demanded); `claude --model claude-bogus-9-9` → visible `unrecognized_model` error
- [x] 2.4 Bundles rebuilt; openspec validate --strict
