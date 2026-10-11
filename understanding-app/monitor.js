// The Claude Monitor assessment (the Operator's question, 2026-10-11): does routing subagent
// conversations through Claude Monitor keep them from mixing with the repo agent's main one?
window.MONITOR = {
  table: [
    ['Risk of "a second conversation per repo"', 'Where it bites today (file:line)', 'Through Claude Monitor?', 'In a separate worktree?'],
    ['The suggestion loop judges and resumes the <b>newest transcript</b> in the repo folder', 'AutopilotService.cs:466 — <code>LastAssistantMessage(repo.Path)</code>', 'still mixed — same folder', 'isolated — the subagent writes elsewhere'],
    ['A driven loop armed with no session pins the newest one', 'AutopilotService.cs:498; AutopilotController.cs:212; arm_my_loop (RepoAgentToolbox.Harness.cs:199)', 'still mixed', 'isolated'],
    ['The arch reads / sends to the newest session when the dock has none', 'ArchAgentService.cs:3761 <code>NewestSessionId(repo.Path)</code>', 'still mixed', 'isolated'],
    ['The dock\'s conversation picker lists every session in the folder', 'ChatController.cs:382 <code>ListSessions(repo.Path)</code>', 'still listed as the parent\'s', 'not listed'],
    ['Autopilot discovery mines every transcript in the folder for routines', 'AutopilotDiscoveryService.cs:87', 'still mined', 'not mined'],
    ['Two CLIs editing one working tree', 'the checkout itself', 'still one tree — the one-writer lock is still needed', 'two trees — no lock, the parent is never blocked'],
    ['Run visibility: busy, stop, the slot the engine checks', 'RunSessionService (the harness\'s own run slots)', 'WORSE — the run leaves the harness: no slot, no stop, no busy unless re-wrapped', 'unchanged — still a harness run'],
    ['Repo-agent tools inside the subagent (mark_step, identity &amp;sub=)', 'the run\'s MCP config', 'needs the stream-mcp path + plumbing', 'unchanged'],
  ],
  why: [
    '<b>Session identity.</b> A conversation is a session id; every <code>--resume</code> forks a new one. Several harness paths find "the agent\'s conversation" as <i>the newest transcript in the repo\'s folder</i> — correct only while exactly one conversation writes there.',
    '<b>One working tree.</b> Two CLIs editing the same files at once can interleave edits and commits in ways nothing undoes.',
    '<b>The arch and the board read one conversation per agent.</b> read_transcript, the policeman, the "finished, not checked" mark — all assume one main thread.',
    'The subagent build already isolates the first two inside the harness: the subagent resolves only its <i>own</i> pinned session, runs under its own run key, and a writer holds a one-writer lock. But the <i>folder</i> is still shared, so every newest-file fallback in the table above can still pick the subagent\'s conversation.',
  ],
  fix: [
    '<b>A git worktree per subagent</b> — e.g. <code>&lt;repo&gt;-subagents/&lt;id&gt;</code> on branch <code>subagent/&lt;id&gt;</code>. A different path means a different <code>~/.claude/projects/</code> folder, so the parent\'s folder only ever holds the parent\'s conversations: every row in the table is closed at the root, not patched one by one.',
    'It also replaces the one-writer lock: the subagent edits its own tree, the parent keeps working, and the summary tells the parent to merge (or cherry-pick) <code>subagent/&lt;id&gt;</code>. Read-only helpers can run in a detached worktree too.',
    'Cost: a worktree is a second checkout on disk (cheap for git, but build artefacts and node_modules are per tree), and the parent gets a branch to merge instead of commits already on its branch.',
    '<b>Claude Monitor stays useful for what it is</b> — a gateway with its own call log and fallback — and it could carry the subagent\'s runs <i>on top of</i> the worktree for observability. It is orthogonal to the mixing question: the folder is decided by the working directory, not by who launches the CLI.',
    'Not changed yet: this is an assessment for the Operator. The branch still runs subagents in the same checkout with the one-writer lock.',
  ],
};
