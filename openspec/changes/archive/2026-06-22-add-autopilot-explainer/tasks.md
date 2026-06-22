# Tasks

## 1. Diagram data

- [x] 1.1 Write `client/src/components/autopilot/autopilotArchitectureData.js`: the
      `AUTOPILOT_MAP` graph spec (nodes/edges for host PC → backend engine → shared
      builder slot → CLI + disk → web UI, machine-grouped) and the `LOOP_FLOW` spec for
      the per-turn decision order, each node carrying a role blurb and a real
      file/line citation.

## 2. Map component

- [x] 2.1 Write `client/src/components/autopilot/AutopilotMap.jsx` with the five views —
      Overview, System map, Step a loop, Decision per turn, Safety fences — switched by a
      local view selector, rendering the graphs via the shared `ChatGraph` cytoscape
      renderer.
- [x] 2.2 Implement the **Step a loop** simulator: arm the gate, feed each turn's agent
      reply, and drive the deterministic outcome — resend / stop-on-done / escalate /
      capped / error — with an iteration counter and a step log.

## 3. View + wiring

- [x] 3.1 Write `client/src/components/autopilot/AutopilotArchitectureView.jsx` (lede +
      `<AutopilotMap>` + sources footer) and wire a **"How autopilot works"** tab
      (`autoarch`) into `AutopilotConsole.jsx`, sibling of "How chat works".
- [x] 3.2 Reuse `ChatGraph.jsx` as the shared renderer (small tweak as needed); keep the
      explainer backend-free (no API calls).

## 4. Styles

- [x] 4.1 Add the `cm-*` styles (and `cm-loop*` for the Step-a-loop simulator) to
      `client/src/pages/autopilot.css`.

## 5. Verify

- [x] 5.1 Build the frontend; verify on an isolated port with Playwright — the tab
      renders, all five views switch, the Step-a-loop simulator runs, 0 console errors.
- [x] 5.2 Honesty pass: every node's file/line citation points at code that exists and
      the prose matches the shipped behavior.

## 6. Ship

- [x] 6.1 Build, deploy to live `:5099` via `swap.ps1` (origin/main guard, merged
      `origin/main` first), browser-verify the tab and System map render with 0 console
      errors. *(operator confirmed live: "it works".)*
- [x] 6.2 Archive: delta folded into the `autopilot-explainer` baseline
      (`openspec/specs/autopilot-explainer/spec.md`); change moved to
      `changes/archive/2026-06-22-add-autopilot-explainer`;
      `feature/autopilot-loop-mode` merged into `main`.
