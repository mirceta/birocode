import AutopilotMap from './AutopilotMap';
import '../../pages/autopilot.css';

// The "How autopilot works" tab of the AutopilotConsole — the sibling of
// ChatArchitectureView. A diagram-driven explainer of the autopilot subsystem: the
// host-only gate, the 10s tick, the two drivers (classifier stub vs deterministic loop
// mode), the shared builder slot, and the stack of safety fences. The hero is the same
// interactive cytoscape grammar (<AutopilotMap> + <ChatGraph> + autopilotArchitectureData),
// owned and maintained as real code like its chat sibling.
//
// No backend — pure reference content. File/line citations point at the real
// implementation so it stays honest:
//   ClaudeWeb.App/Services/Autopilot/AutopilotService.cs   (tick · loop · classifier path)
//   ClaudeWeb.App/Services/Autopilot/AutopilotGate.cs      (host-only master switch)
//   ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs    (per-repo loop state)
//   ClaudeWeb.App/Services/Autopilot/PromptClassifier.cs   (the stub brain)
//   ClaudeWeb.App/Controllers/AutopilotController.cs       (the gated HTTP surface)

export default function AutopilotArchitectureView() {
  return (
    <div className="ca">
      <p className="autopilot__summary">
        How the autopilot actually works — from the gate that only the host PC can open, to
        the 10-second tick, the two drivers (a keyword <b>classifier</b> and deterministic
        <b> loop mode</b>), and the fences that keep it safe. It's all one interactive map: open
        <b> Step a loop</b> to drive the loop decision by hand, or <b>Safety fences</b> to see
        every layer at once. Everything is drawn from the real code (cited in each node); nothing
        here calls the backend.
      </p>

      <section className="ca-sec">
        <AutopilotMap />
      </section>

      <p className="ca-foot">
        Sources: <code>AutopilotService.cs</code> (tick · HandleLoop · TrySend/TrySendLoop),
        <code>AutopilotGate.cs</code> (host-only gate), <code>LoopConfigStore.cs</code> /
        <code>AutopilotConfigStore.cs</code> (loop &amp; global state),
        <code>PromptClassifier.cs</code> (the stub brain),
        <code>AutopilotController.cs</code> (the gated HTTP surface).
      </p>
    </div>
  );
}
