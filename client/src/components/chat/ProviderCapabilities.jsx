import React from 'react';

export default function ProviderCapabilities({ provider, onChooseClaude }) {
  const codex = provider === 'codex';
  return <details className="provider-capabilities" style={{ fontSize: 12, margin: '4px 8px', maxWidth: '100%' }}>
    <summary>{codex ? 'Codex' : 'Claude'} capabilities &amp; switching</summary>
    <p>Chat, history, tools, loops, discovery and Understanding use the selected engine. The saved model also applies to automated turns.</p>
    <p>Switching transfers recent conversation into a new native session. Earlier messages remain in history; when inline context is shortened, the agent also receives a full transcript file. Files in the repository are shared.</p>
    <p>{codex ? 'Instructions: AGENTS.md takes precedence; CLAUDE.md is loaded as a fallback. Ask uses a read-only filesystem sandbox. MCP services may have external effects.' : 'Instructions: CLAUDE.md; when absent, the harness directs Claude to read AGENTS.md. Ask uses Claude plan mode.'}</p>
    <p>Native skills, hooks, plugins, login and hidden reasoning belong to each CLI and are not migrated. Put shared procedures and memory in repository files referenced by your instructions.</p>
    <p>If both instruction files exist, each CLI uses its own precedence. Reference one shared guide from both files to keep project rules aligned.</p>
    {codex && <><p>Claude-in-Chrome and the management agent’s restricted tool interface require Claude. Switch this repository to Claude for Chrome tasks. The Claude management agent can dispatch work to Codex repo agents.</p>
      {onChooseClaude && <button type="button" onClick={onChooseClaude}>Use Claude for Chrome tasks</button>}</>}
  </details>;
}
