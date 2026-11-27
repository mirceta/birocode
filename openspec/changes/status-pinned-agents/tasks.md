# Tasks — status-pinned-agents

- [x] Hub store `status-pins.json` (sourceId + repoId, pin order, idempotent pin/unpin, reorder) + `GET/POST /api/settings/status-pins`, `PUT …/order` (+ .NET tests).
- [x] `statusPins.js`: resolve pins to live agents; greyed with the reason (loading / dark / gone / not listed) (+ node tests).
- [x] Status tab: pinned bar (the list's chip, machine / agent label, same click + double-click; hidden when empty); 📍/📌 pin control beside every list chip on every machine; unpin from the bar.
- [x] Lab against the real fleet 15/15; screenshots.
- [ ] Optional later: drag-to-reorder in the bar (the order endpoint exists).
