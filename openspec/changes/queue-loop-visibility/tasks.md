## 1. Backend — sent-history on the loop record

- [x] 1.1 `LoopConfigStore`: add bounded `QueueSentTexts` (cap 20, drop-oldest,
      newest last) — append in the same land mutation that increments
      `QueueSent`, clear on queue arm; persisted with the record.
- [x] 1.2 `AutopilotController`: expose `queueSentTexts` in the gated
      `/loops/detail` projection and the debug bundle (redacted while the gate
      is closed, like `lastStepText`); ungated projection untouched.

## 2. Frontend — strip reconcile + queue-armed marking

- [x] 2.1 `DockContext`: visible-page ~10s reconcile interval around
      `refresh()`, skipped while any stash mutation request is in flight
      (pending-counter ref); cleared on hide/unmount.
- [x] 2.2 `ChatInput`: optional `queueLoop` prop — when it names this strip's
      tab and is active, render queue-armed strip (numbered chips, head badge
      "in flight" during work/verify phase else "next up", strip accent);
      global stash and unarmed tabs unchanged.
- [x] 2.3 Wire the prop where loop data already flows: Dashboard →
      `PinnedAgent` → `Chat` → `ChatInput`; add `useQueueLoopStatus` hook
      (~10s visible-page poll of ungated `/api/autopilot/loops`, only while a
      tab is active with a non-empty stash) for the main Chat page.
- [x] 2.4 CSS (`chat.css`) + i18n (en/tr) for numbering, badges, accent.

## 3. Frontend — arm preview + sent history surfaces

- [x] 3.1 `DockLoopControl`: queue section shows the FULL numbered stash list
      (scroll-capped) instead of head-only; inspection pane renders
      `queueSentTexts` as "sent ✓" rows labeled "last N" when truncated.
- [x] 3.2 `LoopsView` Queue tab: same full-list preview in the arm form; sent
      rows in the per-agent queue status.
- [x] 3.3 CSS (`autopilot.css`) + i18n keys for both surfaces.

## 4. Verify + wrap-up

- [x] 4.1 Backend e2e on an isolated port: drain a 2-item queue via the stub
      CLI; assert gated detail lists both sent texts in order, ungated
      projection has counts only, re-arm resets the history.
- [x] 4.2 Playwright on the isolated port: strip shrinks within the reconcile
      interval while visible (no refocus); armed strip shows numbering +
      head badge; arm popover lists all items; sent rows render after a land.
- [x] 4.3 Playwright race check: reorder during reconcile keeps the operator's
      order (no visible revert).
- [x] 4.4 `openspec validate queue-loop-visibility --strict` + understanding-app
      honesty pass (queue surface descriptions match the build) + commit on the
      branch.
