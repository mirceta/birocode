# Reconcile agent providers

## Why
The CLI adapter alone leaves Codex history, engine handoff, instructions and loop observation incomplete.

## What Changes
- Read native transcripts from both providers through SessionService.
- Resolve resume ownership and transfer bounded, explicit history at the shared runner.
- Share repo model/tool configuration across manual and automated entry points.
- Bridge instruction discovery; preserve MCP details and credentials safely.
- Expose provider capability limits and integrate auxiliary workflows.

## Impact
Chat, sessions, loops, repo settings, agent helpers and their tests. No deployment is implied.
