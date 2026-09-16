// VENDORED COPY of client/src/components/taskgraph/policemanMachines.js for the build-less understanding app — keep in step.
// The policeman, modelled HONESTLY (openspec policeman-observes-agents): one graph per OWNER,
// never a mix. Three machines are deterministic C# — every node and edge names the module and
// routine that owns it. Two machines are the PROMPT — text the model follows, labelled with the
// step of ArchPoliceman.Prompt they come from. Where a code machine hands control to the model
// (the CLI turn) or reads the model's text back (the NEEDS_HUMAN line), that ONE node / edge is
// marked as the contract boundary. Rendered by cytoscape in the understanding app; pure data +
// validation here (node --test). Positions are preset so the pictures are stable.

export const GROUPS = {
  code: { title: 'DETERMINISTIC — harness code (C#)', word: 'every box and arrow here is a routine that runs the same way every time' },
  prompt: { title: 'PROMPT — text the model follows', word: 'every box and arrow here is what ArchPoliceman.Prompt asks the model to do; nothing here is enforced by code' },
};

export const SHAPES = {
  terminal: 'start / end', state: 'a state it rests in', io: 'a step that reads', process: 'a step that acts', decision: 'a decision', contract: 'the model runs here (boundary)', ref: 'another machine (click)',
};

// Node: id · label · sub (what) · where (module.routine that owns it) · x · y · opts.
const N = (id, label, sub, where, x, y, opts = {}) => ({ id, label, sub, where, x, y, shape: 'state', tone: 'plain', who: 'code', ...opts });
// Edge: source · target · label (the trigger) · where (the routine that fires it) · opts.
const E = (source, target, label, where, opts = {}) => ({ id: `${source}->${target}`, source, target, label, where, who: 'code', ...opts });

export const MACHINES = {
  // ---- 1. the loop and the conversation's lifecycle ------------------------------------------
  loop: {
    group: 'code',
    title: 'The loop & the conversation’s lifecycle',
    lives: ['ClaudeWeb.App/Services/Autopilot/AutopilotService.cs', 'ClaudeWeb.App/Services/Arch/ArchAgentService.Policeman.cs', 'ClaudeWeb.App/Services/Arch/ArchPoliceman.cs (pure rules)', 'ClaudeWeb.App/Services/Arch/ArchStateStore.cs', 'ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs'],
    blurb: 'what state the policeman conversation is in and what moves it — timers, caps, re-arms, rollover, your buttons. The model is inside one box only.',
    nodes: [
      N('off', 'START — Not set up', 'no @arch:policeman conversation yet', 'ArchStateStore (no conversation)', -900, -80, { shape: 'terminal', tone: 'start' }),
      N('armed', 'Armed', 'recipe loop armed · waiting for the interval', 'LoopConfigStore (kind recipe, status armed) · AutopilotService.TickRepo', -900, 200, { tone: 'ok' }),
      N('pass', 'Pass running — the model’s turn', 'claude -p with the ritual prompt', 'AutopilotService.TickRepo → CliRunnerService.RunAsync · see the PROMPT tabs', -420, 300, { shape: 'contract', who: 'model' }),
      N('wait', 'Waiting for you', 'the loop escalated', 'LoopConfigStore status "escalate" (ILoop → LoopDecision.Stop)', -900, 560, { tone: 'warn' }),
      N('rollover', 'Rolling over', 'session cut · handover parked', 'ArchAgentService.RolloverPoliceman', -80, 860),
      N('errored', 'Errored', 'the turn crashed · cooldown', 'LoopConfigStore status "error" · ArchPoliceman.ErrorCooldown = 10 min', -1300, 860, { tone: 'bad' }),
      N('stopped', 'Stopped', 'no tick re-arms it', 'ArchStateStore.Policeman.Enabled = false', -1300, 200),
      N('paused', 'Disarmed', 'operator gate closed / kill switch off', 'AutopilotGate · AutopilotConfigStore.Enabled', -1300, 480, { tone: 'warn' }),
    ],
    edges: [
      E('off', 'armed', '▶ Start', 'ArchAgentService.StartPoliceman', { who: 'human' }),
      E('armed', 'pass', 'interval elapsed · 👁 Check now', 'AutopilotService.TickRepo (quiet floor = ArchAgentService.DrivenQuietFloorFor)'),
      E('pass', 'armed', 'turn ended · context < cap', 'ArchAgentService.AfterPolicemanTurn'),
      E('pass', 'wait', 'the reply ends with "NEEDS_HUMAN:"', 'AutopilotService.NeedsHumanMarker → ILoop LoopDecision.Stop("escalate") — CONTRACT: the model’s text', { who: 'model' }),
      E('wait', 'armed', 'you answer in the conversation', 'ArchAgentService.ResumeLoopIfStopped', { who: 'human' }),
      E('pass', 'rollover', 'context ≥ cap, or 400 turns', 'AfterPolicemanTurn → ArchPoliceman.NeedsRollover (RunSession.LastContextTokens)'),
      E('rollover', 'armed', 'next pass: fresh session + handover', 'ArchAgentService.DecoratePolicemanSend → ArchPoliceman.Handover'),
      E('pass', 'errored', 'turn crashed', 'LoopConfigStore.Resolve("error")'),
      E('errored', 'armed', 'cooldown passed → re-arm', 'ArchAgentService.PolicemanTick (engine tick)'),
      E('armed', 'armed', 'pass 100 = recipe cap → re-arm', 'LoopConfigStore.Resolve("capped") → ArchAgentService.PolicemanTick'),
      E('armed', 'stopped', '■ Stop', 'ArchAgentService.StopPoliceman', { who: 'human' }),
      E('wait', 'stopped', '■ Stop', 'ArchAgentService.StopPoliceman', { who: 'human' }),
      E('stopped', 'armed', '▶ Start', 'ArchAgentService.StartPoliceman', { who: 'human' }),
      E('armed', 'paused', 'gate closed / kill switch off', 'AutopilotGate · AutopilotConfigStore', { who: 'human' }),
      E('paused', 'armed', 'gate open · switch on', 'AutopilotGate · AutopilotConfigStore', { who: 'human' }),
      E('armed', 'off', '🗑 conversation removed', 'ArchStateStore.RemoveConversation', { who: 'human' }),
    ],
  },

  // ---- 2. the card facts and the mechanical judge --------------------------------------------
  facts: {
    group: 'code',
    title: 'Card facts & the mechanical judge',
    lives: ['ClaudeWeb.App/Services/TaskGraph/TaskVerification.cs (TaskVerificationPoller, GitTaskFactsProbe)', 'ClaudeWeb.App/Services/TaskGraph/BoardVerifier.cs', 'ClaudeWeb.App/Services/TaskGraph/TaskLifecycle.cs', 'ClaudeWeb.App/Services/TaskGraph/TaskGraphService.cs', 'ClaudeWeb.App/Services/TaskGraph/BoardIntegrity.cs'],
    blurb: 'runs every minute whether or not the policeman exists: reads git and GitHub, moves cards forward by the facts (never back), and judges every card honest / dishonest / stuck / manual — stamping 🆘 on the stuck ones.',
    nodes: [
      N('poll', 'every 60 s', 'and on "Re-verify board" and sync_card', 'TaskVerificationPoller.VerifyOnce', -900, 0, { shape: 'terminal', tone: 'start' }),
      N('probe', 'read the facts', 'branch · commits · pushed · PR · merge · live', 'GitTaskFactsProbe.Probe (git) · ProbePr (gh)', -560, 0, { shape: 'io' }),
      N('apply', 'record & advance', 'verifiedStatus · warning · forward only', 'TaskGraphService.ApplyVerification ← TaskLifecycle.FromFacts', -200, 0, { shape: 'process', tone: 'ok' }),
      N('judge', 'judge the card', 'one verdict per card', 'BoardIntegrity.Judge', 320, 0, { shape: 'decision' }),
      // the lifecycle as the facts move it
      N('todo', 'To do', '', 'TaskLifecycle.Todo', -1450, 320),
      N('doing', 'Doing', 'conversational: a ping', 'TaskLifecycle.Doing (VerifiedCeiling)', -1010, 320),
      N('committed', 'Committed', 'HasCommits', 'TaskLifecycle.FromFacts', -570, 320),
      N('pr-opened', 'PR open', 'PrNumber && OnOrigin', 'TaskLifecycle.FromFacts', -130, 320),
      N('pr-merged', 'Merged', 'PrMerged', 'TaskLifecycle.FromFacts', 310, 320),
      N('done', 'Done', 'MergeLive (deploy log)', 'TaskLifecycle.FromFacts', 750, 320, { tone: 'ok' }),
      // the verdicts
      N('manual', 'manual', 'not probed, not judged', 'BoardIntegrity.Judge: n.Manual', -100, 600),
      N('dishonest', 'dishonest', 'column > verified', 'TaskLifecycle.IsUnverified · WarningFor', 220, 600, { tone: 'warn' }),
      N('stuck', 'stuck', 'pinged · no PR · BLOCKED note or silent > window', 'BoardIntegrity.StuckReason (window = TaskBoard:StaleHours)', 540, 600, { tone: 'bad' }),
      N('honest', 'honest', 'everything else', 'BoardIntegrity.Judge', 860, 600, { tone: 'ok' }),
      N('stamp', '🆘 stamp', 'needsHuman by "policeman"', 'BoardIntegrity.Apply → TaskGraphService.SetNeedsHuman', 540, 840, { shape: 'process', tone: 'bad' }),
      N('unstamp', 'withdraw own stamp', 'never another raiser’s', 'BoardIntegrity.Apply → SetNeedsHuman(onlyIfBy: policeman)', 860, 840, { shape: 'process' }),
    ],
    edges: [
      E('poll', 'probe', 'each assignee of each card', 'BoardVerifier.VerifyOnce'),
      E('probe', 'apply', 'Facts', 'BoardVerifier.VerifyOnce'),
      E('apply', 'judge', 'then, every card', 'TaskVerificationPoller.VerifyOnce → BoardIntegrity.Apply'),
      E('apply', 'committed', 'advances FORWARD only — never back', 'TaskGraphService.ApplyVerification', { kind: 'link' }),
      E('todo', 'doing', 'arch pings (a claim)', 'ArchAgentService.DispatchTask', { who: 'human' }),
      E('doing', 'committed', 'commits on the branch', 'TaskLifecycle.FromFacts'),
      E('committed', 'pr-opened', 'PR found on GitHub', 'TaskLifecycle.FromFacts'),
      E('pr-opened', 'pr-merged', 'PR merged', 'TaskLifecycle.FromFacts'),
      E('pr-merged', 'done', 'merge live (ancestor of the live commit)', 'TaskLifecycle.FromFacts · IPrFactsProbe.MergeIsAncestor'),
      E('judge', 'manual', 'n.Manual', 'BoardIntegrity.Judge'),
      E('judge', 'dishonest', 'IsUnverified(status, verifiedStatus)', 'BoardIntegrity.Judge'),
      E('judge', 'stuck', 'StuckReason != null', 'BoardIntegrity.Judge'),
      E('judge', 'honest', 'else', 'BoardIntegrity.Judge'),
      E('stuck', 'stamp', 'no request on the card yet', 'BoardIntegrity.Apply'),
      E('honest', 'unstamp', 'carried a policeman stamp', 'BoardIntegrity.Apply'),
    ],
  },

  // ---- 3. the tools and the three fences -----------------------------------------------------
  tools: {
    group: 'code',
    title: 'Tools & the three fences',
    lives: ['ClaudeWeb.App/Services/Arch/ArchMcpServer.cs', 'ClaudeWeb.App/Services/Arch/ArchAgentService.cs (DisallowedToolsFor)', 'ClaudeWeb.App/Services/Chat/ClaudeCliAdapter.cs', 'ClaudeWeb.App/Services/Arch/ArchAgentService.Policeman.cs (the tools)', 'ClaudeWeb.App/Services/TaskGraph/PrTrace.cs · CardObservations.cs'],
    blurb: 'what the model is allowed to touch, and what each tool actually does — deterministically — when it is called. The model chooses WHEN to call; the code decides WHAT happens.',
    nodes: [
      N('launch', 'launch the turn', '--mcp-config · --disallowedTools', 'CliRunnerService.RunAsync ← ClaudeCliAdapter', -1000, 60, { shape: 'process' }),
      N('cli', 'the model’s turn', 'claude -p', 'the PROMPT tabs', -1000, 300, { shape: 'contract', who: 'model' }),
      N('f-list', 'fence 1 · tools/list', 'only the 17 allowed tools are offered', 'ArchMcpServer.ToolsList(conversation) ← ArchPoliceman.AllowedTools', -560, 120, { shape: 'decision' }),
      N('f-call', 'fence 3 · tools/call', 'allowed? else refuse', 'ArchMcpServer.HandleOne: IsPoliceman && !IsToolAllowed', -560, 420, { shape: 'decision' }),
      N('refused', 'refused', '"policeman-observe-only"', 'ArchPoliceman.RefusalDetail', -560, 700, { shape: 'terminal', tone: 'bad' }),
      N('t1', 'board_integrity', 'the live verdict', 'ArchAgentService.ToolBoardIntegrity → BoardIntegrity.Assess', 0, 0, { shape: 'io' }),
      N('t2', 'read_transcript', 'last N messages, any machine', 'ToolReadTranscript → SessionService.GetMessages · FleetClient.ReadTranscript', 0, 140, { shape: 'io' }),
      N('t3', 'list_pull_requests', 'PRs traced to cards', 'ToolListPullRequests → GitTaskFactsProbe.ListPrs · PrTrace.Trace', 0, 280, { shape: 'io' }),
      N('t4', 'sync_card', 'link, then re-verify', 'ToolSyncCard → TaskGraphService.RecordClaim → TaskVerificationPoller.VerifyOnce', 0, 420, { shape: 'process', tone: 'ok' }),
      N('t5', 'observe_card', 'a fixed state + one sentence', 'ToolObserveCard → CardObservations.IsState → TaskGraphService.SetObservation', 0, 560, { shape: 'process' }),
      N('t6', 'flag / clear', 'needsHuman by policeman', 'ToolFlagNeedsHuman · ToolClearNeedsHuman → SetNeedsHuman(onlyIfBy)', 0, 700, { shape: 'process', tone: 'bad' }),
      N('e4', 'the harness moves the card', 'forward only, by the facts', 'BoardVerifier.VerifyOnce → ApplyVerification', 560, 420, { tone: 'ok' }),
      N('e5', 'observation on the card', 'by policeman · at · session id', 'TaskGraphService.CardObservation', 560, 560),
      N('e6', 'request on the card', 'refused on manual · never another raiser’s', 'TaskGraphService.HumanRequest', 560, 700, { tone: 'bad' }),
      N('audit', 'audit', 'every call: actor arch · conversation · tool · outcome', 'ArchAgentService.AuditTool → AutopilotAuditLog', 560, 140, { shape: 'terminal' }),
    ],
    edges: [
      E('launch', 'cli', 'fence 2 · the CLI never offers the 14 withheld (mcp__arch__*)', 'ArchAgentService.DisallowedToolsFor(@arch:policeman)'),
      E('cli', 'f-list', 'initialize · tools/list', 'ArchMcpServer.Handle(body, conversation)', { who: 'model' }),
      E('f-list', 'cli', '17 of 31 tools', 'ArchMcpServer.WithheldTools'),
      E('cli', 'f-call', 'tools/call name, args', 'ArchMcpServer.Handle', { who: 'model' }),
      E('f-call', 'refused', 'withheld tool', 'ArchMcpServer.HandleOne'),
      E('f-call', 't1', 'allowed', 'ArchMcpServer.Call'),
      E('f-call', 't2', 'allowed', 'ArchMcpServer.Call'),
      E('f-call', 't3', 'allowed', 'ArchMcpServer.Call'),
      E('f-call', 't4', 'allowed', 'ArchMcpServer.Call'),
      E('f-call', 't5', 'allowed', 'ArchMcpServer.Call'),
      E('f-call', 't6', 'allowed', 'ArchMcpServer.Call'),
      E('t4', 'e4', 'one verifier pass', 'TaskVerificationPoller.VerifyOnce'),
      E('t5', 'e5', 'unknown state → error · manual → refused', 'ToolObserveCard'),
      E('t6', 'e6', 'manual → refused · not mine → not-yours', 'ToolFlagNeedsHuman · ToolClearNeedsHuman'),
      E('t1', 'audit', '', 'AuditTool'),
      E('t2', 'audit', '', 'AuditTool'),
      E('t3', 'audit', '', 'AuditTool'),
    ],
  },

  // ---- 4. the pass, as the PROMPT describes it -----------------------------------------------
  'prompt-pass': {
    group: 'prompt',
    title: 'The pass — what the prompt asks for, in order',
    lives: ['ClaudeWeb.App/Services/Arch/ArchPoliceman.cs → Prompt(boardGoal), steps 1–6', 'shown live in the Policeman subtab ("show the prompt it runs")'],
    blurb: 'this is text. The model follows it; nothing here is enforced — a pass could skip a step. What each tool DOES when called is on the deterministic "Tools" tab.',
    nodes: [
      N('s1', '1 · board_integrity', 'read the harness’s verdict', 'Prompt step 1', -440, 0, { shape: 'io', who: 'model' }),
      N('s2', '2 · list_tasks', 'read every card and its marks', 'Prompt step 2', -120, 0, { shape: 'io', who: 'model' }),
      N('s3', '3 · read_transcript', 'the assignee’s last 4 messages', 'Prompt step 2 — READ EVERY AGENT', 200, 0, { shape: 'io', who: 'model' }),
      N('s4', '4 · judge & observe', 'which state is this card in? → observe_card', 'Prompt step 2 (states: CardObservations)', 560, 0, { shape: 'decision', tone: 'ok', who: 'model' }),
      N('s5', '5 · list_pull_requests', 'each repo · PRs traced to cards', 'Prompt step 3 — MOVE CARDS TO THE FACTS', 560, 220, { shape: 'io', who: 'model' }),
      N('s6', '6 · sync_card', 'a card behind its PR → link it', 'Prompt step 3', 200, 220, { shape: 'process', tone: 'ok', who: 'model' }),
      N('s7', '7 · flag / clear', 'stuck, asked, blocked, errored, keeps lying', 'Prompt step 4 — FLAG', -120, 220, { shape: 'process', tone: 'bad', who: 'model' }),
      N('s8', '8 · verdict', 'counts · moves · observations · flags · or "no change"', 'Prompt steps 5–6 — PROVENANCE, verdict', -440, 220, { shape: 'terminal', who: 'model' }),
      N('cards', 'HOW IT JUDGES A CARD', 'the nine states the prompt describes → its tab', 'Prompt steps 2–4', 960, 440, { shape: 'ref', who: 'model', to: 'prompt-cards' }),
    ],
    edges: [
      E('s1', 's2', '', 'Prompt', { who: 'model' }),
      E('s2', 's3', 'each in-flight card', 'Prompt step 2', { who: 'model' }),
      E('s3', 's4', 'judge from its own words', 'Prompt step 2', { who: 'model' }),
      E('s4', 's3', 'next card', 'Prompt step 2', { who: 'model' }),
      E('s4', 's5', 'all cards read', 'Prompt step 3', { who: 'model' }),
      E('s5', 's6', 'a card is behind its PR', 'Prompt step 3', { who: 'model' }),
      E('s6', 's5', 'next PR / repo', 'Prompt step 3', { who: 'model' }),
      E('s5', 's7', 'all repos checked', 'Prompt step 4', { who: 'model', curve: 'arc' }),
      E('s7', 's8', '', 'Prompt steps 5–6', { who: 'model' }),
      E('s4', 'cards', 'lands in exactly one of', 'Prompt steps 2–4', { who: 'model', kind: 'link' }),
    ],
  },

  // ---- 5. how the PROMPT tells it to judge a card --------------------------------------------
  'prompt-cards': {
    group: 'prompt',
    title: 'How it judges a card — the states the prompt describes',
    lives: ['ClaudeWeb.App/Services/Arch/ArchPoliceman.cs → Prompt, steps 2–4', 'the vocabulary it may write: ClaudeWeb.App/Services/TaskGraph/CardObservations.cs (enforced by observe_card)'],
    blurb: 'the model’s mental model of a card, as the prompt frames it. The facts-driven states (behind, ahead, stuck-by-silence, manual, delivered) come to it READY-MADE from board_integrity and list_pull_requests; only the readings are its own judgement.',
    nodes: [
      N('c-unassigned', '📥 Unassigned', 'To do, nobody on it → nothing', 'from list_tasks (code)', -120, 0, { who: 'model' }),
      N('c-waiting', '⏳ Waiting for the arch', 'assigned, not pinged → nothing', 'from list_tasks: awaitingDispatch (code)', 220, 0, { who: 'model' }),
      N('c-working', '⚙️ Working', 'read: agent active → observe_card working', 'Prompt step 2 — the model’s reading', 560, 0, { tone: 'ok', who: 'model' }),
      N('c-ahead', '⚠️ Ahead of the facts', 'report; never demote', 'from board_integrity: dishonest (code)', 1000, 0, { tone: 'warn', who: 'model' }),
      N('c-behind', '⏩ Behind the facts', '→ sync_card', 'from list_pull_requests: tracedTo.behind (code)', 220, 280, { tone: 'ok', who: 'model' }),
      N('c-stuck', '🛑 Stuck', 'asked · blocked · errored (read) · silent (code) → observe, flag', 'Prompt step 2 + board_integrity: stuck', 560, 280, { tone: 'bad', who: 'model' }),
      N('c-skip', '🚫 Not mine', 'manual or delivered → leave alone', 'from board_integrity: manual · list_tasks: status (code)', 1000, 280, { shape: 'terminal', who: 'model' }),
      N('c-flagged', '🆘 Flagged', 'human request on it → clear if mine & resolved', 'from board_integrity: needsHuman (code)', -120, 560, { tone: 'bad', who: 'model' }),
      N('c-review', '👀 Waiting for review', 'read: PR open, agent done → observe; report if stale', 'Prompt step 2 — the model’s reading', 560, 560, { who: 'model' }),
    ],
    edges: [
      E('c-unassigned', 'c-waiting', 'arch or you assign', 'outside the policeman', { who: 'human' }),
      E('c-waiting', 'c-working', 'arch pings', 'outside the policeman', { who: 'human' }),
      E('c-working', 'c-ahead', 'someone moved it past the facts', 'outside the policeman', { who: 'human' }),
      E('c-ahead', 'c-working', 'facts catch up', 'the verifier (code)', { who: 'code' }),
      E('c-working', 'c-behind', 'PR traced to the card', 'PrTrace (code)', { who: 'code' }),
      E('c-working', 'c-stuck', 'asks · blocks · errors (read) · silent > window (code)', 'Prompt step 2 · BoardIntegrity.StuckReason', { who: 'model' }),
      E('c-working', 'c-skip', 'delivered · go manual', 'the verifier · you', { who: 'code' }),
      E('c-ahead', 'c-stuck', 'keeps lying, nobody fixes it', 'Prompt step 4 — the model’s judgement', { who: 'model' }),
      E('c-behind', 'c-review', 'sync_card → PR open', 'the verifier (code)', { who: 'code' }),
      E('c-behind', 'c-skip', 'sync_card → merged / done', 'the verifier (code)', { who: 'code' }),
      E('c-review', 'c-skip', 'merged', 'the verifier (code)', { who: 'code' }),
      E('c-review', 'c-ahead', 'PR closed unmerged', 'the verifier (code)', { who: 'code' }),
      E('c-stuck', 'c-flagged', 'flag_needs_human (with reason)', 'Prompt step 4 — the model decides; the code stamps', { who: 'model' }),
      E('c-flagged', 'c-working', 'you Resolve · agent back on track', 'outside the policeman · Prompt step 4 (clear own)', { who: 'human' }),
    ],
  },
};

export const ORDER = ['loop', 'facts', 'tools', 'prompt-pass', 'prompt-cards'];

/** Cytoscape elements for one machine. */
export function elements(key) {
  const m = MACHINES[key];
  if (!m) throw new Error('unknown machine ' + key);
  return [
    ...m.nodes.map((n) => ({
      data: { id: n.id, label: n.label, sub: n.sub || '', where: n.where || '', shape: n.shape, tone: n.tone, who: n.who, to: n.to },
      position: { x: n.x, y: n.y },
      classes: `shape-${n.shape} tone-${n.tone} who-${n.who} group-${m.group}`,
    })),
    ...m.edges.map((e) => ({
      data: { id: e.id, source: e.source, target: e.target, label: e.label, where: e.where || '', who: e.who, kind: e.kind || 'flow', curve: e.curve || 'bezier' },
      classes: `who-${e.who} kind-${e.kind || 'flow'}`,
    })),
  ];
}

/** Every machine is well-formed: known shapes and owners, every endpoint known, every node and
 * edge names WHERE it lives, every node reachable or an entry, and the owner rule holds — a code
 * machine has no model element except its marked contract boundary; a prompt machine's nodes
 * are all the model's. */
export function validate() {
  const problems = [];
  for (const [key, m] of Object.entries(MACHINES)) {
    if (!GROUPS[m.group]) problems.push(`${key}: unknown group ${m.group}`);
    const ids = new Set(m.nodes.map((n) => n.id));
    for (const n of m.nodes) {
      if (!SHAPES[n.shape]) problems.push(`${key}/${n.id}: unknown shape ${n.shape}`);
      if (!n.where) problems.push(`${key}/${n.id}: no "where"`);
      if (!['code', 'model', 'human'].includes(n.who)) problems.push(`${key}/${n.id}: unknown who ${n.who}`);
    }
    for (const e of m.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) problems.push(`${key}/${e.id}: unknown endpoint`);
      if (!e.where) problems.push(`${key}/${e.id}: no "where"`);
    }
    const ins = new Set(m.edges.map((e) => e.target));
    for (const n of m.nodes) if (!ins.has(n.id) && n.shape !== 'terminal' && n.shape !== 'ref' && !(key === 'facts' && n.id === 'todo') && !(key === 'prompt-cards' && n.id === 'c-unassigned') && !(key === 'tools' && n.id === 'launch') && !(key === 'prompt-pass' && n.id === 's1')) problems.push(`${key}/${n.id}: unreachable`);
    if (m.group === 'code') {
      const modelNodes = m.nodes.filter((n) => n.who === 'model');
      if (modelNodes.some((n) => n.shape !== 'contract')) problems.push(`${key}: a model node that is not the contract boundary`);
      const modelEdges = m.edges.filter((e) => e.who === 'model');
      for (const e of modelEdges) if (!modelNodes.some((n) => n.id === e.source || n.id === e.target)) problems.push(`${key}/${e.id}: a model edge away from the contract boundary`);
    } else {
      for (const n of m.nodes) if (n.who !== 'model') problems.push(`${key}/${n.id}: a prompt machine node owned by ${n.who}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
