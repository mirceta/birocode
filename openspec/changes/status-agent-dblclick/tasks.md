# Tasks — status-agent-dblclick

## 1. Implementation

- [x] 1.1 `harnessTargetOf(machine, agent)` shared by the details' big button and the chip; chip gains `onDoubleClick` → `focusAgentTab` (no second implementation)
- [x] 1.2 Tooltip hint "double-click: open harness"; no action/hint when the machine's address is unknown; single-click toggle untouched (no delay timer — the two clicks cancel out)

## 2. Verification

- [x] 2.1 Evidence rig `shot-status-agent-dblclick.mjs`, 10/10: opens the badge's named tab, focus-not-reload on repeat, details never left toggled, single click still expands, merged layout, unknown address inert, ✓ mark-as-checked independent, no page errors; screenshots committed
- [x] 2.2 Client suite green; Management App bundle rebuilt; openspec validate --strict
