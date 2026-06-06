import { toolLabel } from './toolLabels';

// Inline status line shown while Claude uses a tool (e.g. "Editing
// document..."). Driven by `tool` SSE events; the raw tool name is mapped to
// friendly copy in toolLabels.js so no technical names leak into the UI.
export default function ToolStatus({ name }) {
  return (
    <div className="tool-status" role="status">
      <span className="tool-status__spinner" aria-hidden="true" />
      <span>{toolLabel(name)}</span>
    </div>
  );
}
