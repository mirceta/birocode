import ChatMap from './ChatMap';
import '../../pages/autopilot.css';

// The "How chat works" tab of the AutopilotConsole.
// A diagram-driven explainer of the chat system end-to-end. The hero — and now the
// ONLY visual grammar — is the interactive cytoscape map (<ChatMap> + <ChatGraph> +
// chatArchitectureData), a first-class React component owned and maintained like any
// other code (it was once an iframe of a frozen snapshot of the rolling
// understanding-app; a permanent product tab owns its content).
//
// HISTORY: this tab used to carry two extra prose sections below the map — the
// conversation↔repo↔run binding (HTML pills) and an interactive "what a refresh does"
// cell grid. Those were three different visual idioms for one topic. They are now
// FOLDED INTO the map itself as two overlays on the System-map view ("Show the
// binding" and "⟳ Refresh!"), so the eye learns one visual language and the map is the
// single source of truth. See ChatMap.jsx / chatArchitectureData.js (bind/fate/twist).
//
// No backend — pure reference content. File/line citations point at the real
// implementation so it stays honest:
//   client/src/context/ChatContext.jsx
//   ClaudeWeb.App/Controllers/ChatController.cs
//   ClaudeWeb.App/Services/RunSessionService.cs

export default function ChatArchitectureView() {
  return (
    <div className="ca">
      <p className="autopilot__summary">
        How a chat actually works in Claude Web — from the phone in your hand to the CLI
        process and the files on disk. It's all one interactive map: open <b>System map</b>,
        then flip on the <b>Show the binding</b> overlay to see how a conversation ties to a
        run, or <b>⟳ Refresh!</b> to see what a browser refresh destroys versus what survives.
        Everything is drawn from the real code (cited in each node); nothing here calls the backend.
      </p>

      <section className="ca-sec">
        <ChatMap />
      </section>

      <p className="ca-foot">
        Sources: <code>ChatContext.jsx</code> (reconcile / attachToRun / streamRun),
        <code>ChatController.cs</code> (chat / stream / runs / stop),
        <code>RunSessionService.cs</code> (RunSession buffer &amp; replay).
      </p>
    </div>
  );
}
