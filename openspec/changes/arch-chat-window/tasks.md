## 1. Build

- [x] 1.1 `transcriptWindow.js`: `TRANSCRIPT_WINDOW` (50 / 50), `windowOf`, `widened`,
      `tailFor`; `Chat.jsx` reads its window from it (no behaviour change).
- [x] 1.2 `Arch.jsx`: `visibleCount` window, `?tail=` fetch, "Show earlier messages (N)"
      with the exact hidden count, reveal keeps the reading position, reset on
      send / conversation change / reload; scroller-aware follow and stick detection;
      `data-conv` / `data-window` / `data-total` on the pane.
- [x] 1.3 Server: `GET /api/arch/messages?tail=N` → last N + `total` via
      `TranscriptWindow.Tail`; no tail unchanged.
- [x] 1.4 Tests: `transcriptWindow.test.mjs` (+3), `TranscriptWindowTests` (+3 facts, 7 cases).
- [x] 1.5 Management App bundle rebuilt (the Arch page ships in it).

## 2. Verify

- [x] 2.1 .NET + client suites green; detached `verify-arch-window.mjs` against an isolated
      instance with a synthetic 3000-message arch transcript (temp arch home; live home
      untouched): window only, fast first render, payload before/after, Show earlier
      (+50, count, position), no jump while scrolled up, reload to the tail.
      DONE 2026-09-16 — .NET 508 pass (+7), client 102 pass (+3);
      `@@ARCH-WINDOW@@ pass:true, 22 checks, 0 failed` (log
      `.claudeweb-preview/out-arch-window.log`): poll 808 254 B → 13 603 B (59×),
      50 bubbles mounted of 3000, first settled render 957–2 894 ms across runs;
      screenshots `docs/screenshots/arch-window-{1-window,2-after-show-earlier}.png`.
- [ ] 2.2 On the live hub after deploy: the Arch agent conversation (5000+ lines) opens
      at the tail at once, "Show earlier" works, a wake-up still appends at the bottom.

## 3. Ship

- [ ] 3.1 PR from `feature/arch-chat-window` against main (task f1c917f5217540b4888cef563d872902);
      merge and deploy on the Operator's word.
