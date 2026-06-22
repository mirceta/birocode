# Add an in-app "How autopilot works" interactive explainer

## Why

The autopilot subsystem is now substantial — a host-only gate, a 10-second tick, two
drivers (a keyword `PromptClassifier` stub and deterministic loop mode), a shared
single-writer builder slot, and a stack of safety fences (gate, kill switch, threshold,
deny-list, iteration cap, single-writer slot, audit). None of that is legible from the
operational tabs (Agents, Loops, Intercepted, …): they show *state*, not *how the thing
decides*. An End User — or a future maintainer — has no way to see, in one place, what
opens the gate, what runs each turn, and what stops a runaway loop, short of reading the
backend source.

Its sibling, the chat engine, already got this treatment: the **"How chat works"** tab
(`ChatArchitectureView`) renders the chat subsystem as an interactive cytoscape map. The
autopilot deserves the same — a diagram-driven explainer that is *owned as real code*,
cites the actual implementation file/line at each node so it can't quietly drift, and
lets the reader **drive the loop decision by hand** rather than just read about it.

## What Changes

- **New "How autopilot works" tab** in the `AutopilotConsole` (sibling of "How chat
  works"), backed by `AutopilotArchitectureView` → `AutopilotMap`, reusing the same
  interactive cytoscape grammar (`ChatGraph` + a dark-theme renderer) the chat explainer
  uses. The console is itself an Advanced-mode surface, so no separate gate is added.
- **Five internal views** the reader switches between:
  - **Overview** — a card index of the other four.
  - **System map** — the whole subsystem as one interactive graph (host PC → backend
    engine → shared builder slot → CLI + disk → web UI), each box clickable for its role
    and source file.
  - **Step a loop** — a hands-on simulator: arm the gate, then feed what the agent
    "replied" each turn and watch loop mode resend, count iterations, and stop on
    *done* / *escalate* / *capped* / *error*.
  - **Decision per turn** — the deterministic check order loop mode runs
    (`errored → sentinel → deny-list → cap → resend`) as a flow graph.
  - **Safety fences** — every layer that keeps autopilot from acting unasked, in one view.
- **Pure reference content, no backend** — the explainer never calls the API; every node
  carries a file/line citation pointing at the real implementation
  (`AutopilotService.cs`, `AutopilotGate.cs`, `LoopConfigStore.cs`,
  `AutopilotConfigStore.cs`, `PromptClassifier.cs`, `AutopilotController.cs`) so the
  diagram stays honest against the code.

## Impact

- **Affected specs:** `autopilot-explainer` (new capability spec, seeded by this change's
  delta).
- **Affected code (new):** `client/src/components/autopilot/AutopilotArchitectureView.jsx`,
  `client/src/components/autopilot/AutopilotMap.jsx`,
  `client/src/components/autopilot/autopilotArchitectureData.js`.
- **Affected code (edited):** `client/src/components/autopilot/AutopilotConsole.jsx`
  (the new tab button + mount), `client/src/components/autopilot/ChatGraph.jsx` (shared
  renderer reused), `client/src/pages/autopilot.css` (`cm-*` styles incl. the
  Step-a-loop simulator).
- **Reuses** the chat explainer's interactive-graph grammar rather than inventing a new
  representation.
- **Out of scope (deferred):** wiring the explainer to live autopilot state (it stays a
  static reference); any change to autopilot *behavior* — this change only documents what
  already ships.
