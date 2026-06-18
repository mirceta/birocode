import AutopilotConsole from '../components/autopilot/AutopilotConsole';

// The routed Autopilot tab (App.jsx `Route path="autopilot"`). It's a thin
// wrapper over the shared AutopilotConsole — the same console the dashboard dock
// renders — so the two surfaces are identical, never drifting copies
// (plans/autopilot-to-harness.md). This tab is the mobile-first entry point.
export default function Autopilot() {
  return <AutopilotConsole />;
}
