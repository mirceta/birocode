# Design

Keep native CLI sessions independent. Normalize their durable records into the existing transcript contracts. Store a harness-owned handoff snapshot outside repos, linked to the new native session. Bound model-visible handoffs and disclose truncation; retain the full human-visible snapshot. Centralize ownership, model and tool resolution at CliRunnerService. Codex reads CLAUDE.md as a configured fallback to AGENTS.md. Native skills/hooks/auth remain provider-owned and are disclosed. Management structural tool denial remains Claude-only until an equally enforceable Codex capability exists; do not silently weaken it.

Use isolated artifacts and fixture tests, then isolated real CLI and browser verification. Keep native stores and live harness data untouched by tests.
