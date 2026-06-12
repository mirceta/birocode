# Doc viewer — live examples

Open this file in the **Files tab** (or any tab using the shared
Markdown component) to see what the doc-viewer slices enable. Each
example states the slice that makes it work (see
[doc-viewer.md](doc-viewer.md)).

## Slice 1 — mermaid labels that wrap (SHIPPED)

Before slice 1, anything beyond a short box title was truncated —
diagrams had to be stripped to bare names. Now labels wrap and boxes
grow. This diagram is the acceptance shape: 3+-line labels, a styled
subgraph loop, multi-line edge labels.

```mermaid
flowchart TD
    A["Step 1: Ingest the exposure request<br/>Validate the payload against the schema<br/>and reject anything missing a correlation id"] --> B
    B["Step 2: Resolve the target environment<br/>Look up the tenant routing table,<br/>pick staging vs production,<br/>and pin the API version"] --> C
    subgraph LOOP["Retry loop -- runs until the gateway accepts"]
        direction TB
        C["Step 3: Build the exposure manifest<br/>Tools: autodev-form-companion, manifest-linter<br/>Caveat: field order matters to the legacy gateway"] --> D
        D{"Gateway accepted?<br/>(HTTP 201 with a tracking id)"}
        D -- "no: backoff and retry<br/>with jittered delay" --> C
    end
    D -- yes --> E["Step 4: Persist the tracking id<br/>Write to the runs ledger,<br/>emit the exposure-created event,<br/>and notify the operator channel"]
    style LOOP fill:#f6f0ff,stroke:#7c5cbf,stroke-width:2px
    style D fill:#fff4e0,stroke:#c08a2d
```

Still true per [doc-principles.md](doc-principles.md) #6: a diagram is a
map, not the document — wrapping working doesn't mean labels should
become paragraphs.

GFM tables and code fences render alongside, unchanged:

| Slice | What it adds | Status |
|-------|--------------|--------|
| 1 | mermaid label wrapping | shipped |
| 2 | relative links + back/forward in the Files viewer | next |
| 3 | cross-repo `../` links | deferred |
| 4 | local `.html` webview | deferred |

```csharp
// code fences keep monospace + fencing
var tracked = ledger.Persist(trackingId);
```

## Slice 2 — relative links (NEXT — these will work after slice 2)

- Same-folder doc link: [doc-viewer.md](doc-viewer.md)
- Link to a file elsewhere in the repo: [CLAUDE.md](../CLAUDE.md)
- Anchor within this file: [back to slice 1](#slice-1--mermaid-labels-that-wrap-shipped)
- A `.cs` link that should open in the Files viewer, not a doc view:
  [Mermaid.jsx](../client/src/components/shared/Mermaid.jsx)

Until slice 2 lands, clicking these in the Files viewer does nothing
(links aren't intercepted there yet) — that's the gap slice 2 closes.
