// The Claude Monitor assessment (the Operator's question, 2026-10-11): does routing goal conversation
// conversations through Claude Monitor keep them from mixing with the repo agent's main one?
window.MONITOR = {
  table: [
    ['Risk of "a second conversation per repo"', 'Where it bites today (file:line)', 'Through Claude Monitor?', 'In a separate worktree?'],
    ['The suggestion loop judges and resumes the <b>newest transcript</b> in the repo folder', 'AutopilotService.cs:466 — <code>LastAssistantMessage(repo.Path)</code>', 'still mixed — same folder', 'isolated — the goal conversation writes elsewhere'],
    ['A driven loop armed with no session pins the newest one', 'AutopilotService.cs:498; AutopilotController.cs:212; arm_my_loop (RepoAgentToolbox.Harness.cs:199)', 'still mixed', 'isolated'],
    ['The arch reads / sends to the newest session when the dock has none', 'ArchAgentService.cs:3761 <code>NewestSessionId(repo.Path)</code>', 'still mixed', 'isolated'],
    ['The dock\'s conversation picker lists every session in the folder', 'ChatController.cs:382 <code>ListSessions(repo.Path)</code>', 'still listed as the parent\'s', 'not listed'],
    ['Autopilot discovery mines every transcript in the folder for routines', 'AutopilotDiscoveryService.cs:87', 'still mined', 'not mined'],
    ['Two CLIs editing one working tree', 'the checkout itself', 'still one tree — the one-writer lock is still needed', 'two trees — no lock, the parent is never blocked'],
    ['Run visibility: busy, stop, the slot the engine checks', 'RunSessionService (the harness\'s own run slots)', 'WORSE — the run leaves the harness: no slot, no stop, no busy unless re-wrapped', 'unchanged — still a harness run'],
    ['Repo-agent tools inside the goal conversation (mark_step, identity &amp;sub=)', 'the run\'s MCP config', 'needs the stream-mcp path + plumbing', 'unchanged'],
  ],
  why: [
    '<b>Session identity.</b> A conversation is a session id (a <code>--resume</code> appends to it or, on some CLI versions, forks a new one). Several harness paths find "the agent\'s conversation" as <i>the newest transcript in the repo\'s folder</i> — correct only while exactly one conversation writes there.',
    '<b>One working tree.</b> Two CLIs editing the same files at once can interleave edits and commits in ways nothing undoes.',
    '<b>The arch and the board read one conversation per agent.</b> read_transcript, the policeman, the "finished, not checked" mark — all assume one main thread.',
    'The goal conversation build already isolates the first two inside the harness: the goal conversation resolves only its <i>own</i> pinned session, runs under its own run key, and a writer holds a one-writer lock. But the <i>folder</i> was still shared, so every newest-file fallback in the table above could pick the goal conversation\'s conversation — which the main-conversation pointer now rules out.',
  ],
  fix: [
    '<b>Worktrees were rejected</b> (the Operator): our products bind fixed ports (the Preview Port 5200, each repo\'s Local apps), so a second checkout running the app collides with the first; every tree also needs its own install and build.',
    '<b>The decision: make the main conversation explicit.</b> A pointer per repo agent (<code>main-conversations.json</code>) that every reader uses instead of "the newest file". It follows the parent\'s own builder runs (a run that resumed the main session moves it to the run\'s session, in place or forked) and the main dock tab; goal conversation runs, the ask lane and side conversations never move it; the Operator can set it from the picker (★ make main).',
    'Readers switched, with no newest-file fallback: the suggestion loop, a driven loop armed with no session, dock arming, <code>arm_my_loop</code>, the arch\'s send / read_transcript, the goal conversation\'s summary. The picker marks ★ main and names each goal conversation\'s sessions.',
    '<b>Concurrent writers</b>: <code>start_goal_conversation(concurrent: true)</code> when you are sure the files do not overlap — it runs alongside the parent with no lock and is told to touch and commit only its own files. The default stays one writer at a time.',
    '<b>Claude Monitor</b> remains a transport choice (its call log, its fallback) with no bearing on mixing — the folder is decided by the working directory, and the pointer makes the folder irrelevant.',
  ],
};
