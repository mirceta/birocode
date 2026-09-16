import './agentMark.css';

// The agent identity mark (fleet task 4ddcfce3): the ONE badge element Fleet Status
// chips and Kanban assignee chips both render, so a given agent shows the identical
// glyph + monogram everywhere. The mark comes from the shared colour module
// (graphColors.agentMark via useTaskColors().mark) — never computed here — and is a
// pure function of the agent's identity, so it is stable across reloads and views.
//
// Readable without colour: the glyph and the monogram carry the identity on their own;
// the hue the chip already has is the third, redundant cue. The full handle rides in
// the title and aria-label so a screen reader (or a hover) gets the exact agent.
export default function AgentMark({ mark, compact = false }) {
  if (!mark) return null;
  return (
    <span
      className={`agent-mark${compact ? ' agent-mark--compact' : ''}`}
      title={mark.label}
      aria-label={mark.label}
      data-agent-mark={mark.key}
      data-glyph={mark.glyph}
      data-monogram={mark.monogram}
    >
      <span className="agent-mark__glyph" aria-hidden="true">{mark.glyph}</span>
      <span className="agent-mark__mono" aria-hidden="true">{mark.monogram}</span>
    </span>
  );
}
