## 1. Build

- [x] 1.1 `graphColors.js`: `GLYPHS`, `hashKey`, `agentKey`, `glyphOf`, `abbrMachine`,
      `abbrRepo`, `monogramOf`, `agentMark`; `useTaskColors().mark` and the re-export.
- [x] 1.2 `AgentMark.jsx` + `agentMark.css`: the one badge element, title + aria-label.
- [x] 1.3 Fleet Status agent chips render the mark (name column, before 🏛); Kanban card
      and detail assignee chips render the mark (replacing the 👤 prefix); titles name it.
- [x] 1.4 Management App bundle rebuilt (both views live there).

## 2. Verify

- [x] 2.1 `agentIdentity.test.mjs`: scheme examples, determinism, 6×6 same-hue fleet
      uniqueness, stability across slot maps, Fleet/Kanban parity incl. hue wrap; added to
      `npm test`.
- [x] 2.2 Headless screenshot of Fleet Status and the Kanban board with several same-hue
      agents (mocked fleet + board), showing the marks distinguish them.

## 3. Ship

- [ ] 3.1 Push, PR, merge; dfee16ea (activity dot) stacks on the chip after this.
