# Design — status-pinned-agents

```
hub: status-pins.json   [{ sourceId, repoId, machine, name, pinnedAt }]   (pin order)
        ▲ POST {sourceId, repoId, pinned, machine, name}  (idempotent)
        │
Status tab ── GET pins ──► resolvePins(pins, fleet.machines, { loaded })
                             ├─ live  → <AgentChip prefix=machine …/>  (the list's chip: same state, click, dbl-click)
                             └─ else  → greyed placeholder "machine / agent — <why>"   (never dropped)
list chip ─ 📍/📌 PinButton ─► POST
```

- **The key** is `sourceId|repoId`: `self` for this harness, the collector source id for a peer. The same pair the
  open-agent feature resolves, and it survives renames.
- **The same chip.** The bar renders the list's `AgentChip`, so live state, colour/mark, the finished "!", ✓ checked,
  click-to-expand and double-click-to-open are not re-implemented. Its details panel uses its own selection
  (`pinOpen`), so an agent expanded in the bar is not also expanded in its machine section.
- **Why a pin isn't live:**
  - not loaded yet → "loading the fleet…";
  - machine gone → "no longer in the fleet";
  - machine dark → "<machine> is not answering";
  - agent not listed → "not listed on that machine right now".
- **Compact.** One wrapping row in the Status tab's styling; pin controls appear on hover (always shown when pinned,
  and on touch screens).

## Evidence

- .NET `StatusPinsTests` (3); client `statusPins.test.mjs` (4).
- **Lab on the hub machine** (`.claudeweb-preview/pinlab/lab.ps1`): an isolated harness built from the branch reading
  the **real fleet**. It got a copy of the live registry, docks and collector sources and the live key ring; it had
  no arch, no loops and the gate was closed. **15/15**:
  - pins from list chips on two machines;
  - the bar's order, labels, live state, click and double-click target;
  - a pin on a dark fleet machine greyed with the reason;
  - "loading" (never "gone") before the first poll;
  - reload; a second browser; unpin from the bar; the bar hides when empty.
